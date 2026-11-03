import { NextRequest } from "next/server";
import { getCtl, subscribe } from "@/lib/wyrm/runcontrol";
import type { LiveEvent } from "@/lib/wyrm/runcontrol";

export const dynamic = "force-dynamic";

// GET /api/runs/:id/live — Server-Sent Events stream of a live run:
// thinking deltas, structured steps, steering, status transitions.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctl = getCtl(id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: LiveEvent | { type: string; [k: string]: unknown }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      if (!ctl) {
        // run is not active — tell the client and close
        send({ type: "hello", runId: id, status: "inactive", thinking: "", turns: 0, steers: 0 });
        send({ type: "run-end", status: "inactive" });
        controller.close();
        return;
      }

      send({
        type: "hello",
        runId: id,
        status: ctl.snapshot.status,
        thinking: ctl.snapshot.thinking,
        turns: ctl.snapshot.turns,
        steers: ctl.steerLog.length,
      });

      const unsubscribe = subscribe(id, (ev) => {
        send(ev);
        if (ev.type === "run-end") {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });

      // heartbeat so proxies keep the connection warm
      const hb = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 15000);

      // clean up when the client disconnects
      const cleanup = () => {
        closed = true;
        clearInterval(hb);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      _req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
