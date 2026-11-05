/* ═══════════════════════════════════════════════════════════════════
   WRYM · wyrm-community.js — the community board application.
   Live PR board (public GitHub API, no auth), merged-level roll-up from
   the site archive, contributor credits. Zero dependencies, zero backend.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var REPO = "namandhakad712/WRYM";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  function gh(path) {
    return fetch("https://api.github.com" + path, {
      headers: { Accept: "application/vnd.github+json" },
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + path);
      return r.json();
    });
  }

  var LABEL_CHIPS = {
    "community-level": "gray", "bot:validated": "green", "bot:awaiting-review": "blue",
    "bot:needs-revision": "amber", "bot:approved": "purple", "bot:changes-requested": "red",
  };

  function prCard(pr, state) {
    var labels = (pr.labels || []).map(function (l) {
      var cls = LABEL_CHIPS[l.name] || "gray";
      return '<span class="lbl lbl-' + cls + '">' + esc(l.name) + "</span>";
    }).join(" ");
    var age = Math.max(1, Math.round((Date.now() - Date.parse(pr.updated_at || pr.created_at)) / 86400000));
    var who = '<a href="' + esc(pr.user.html_url) + '">@' + esc(pr.user.login) + "</a>";
    return (
      '<div class="pr-card">' +
      '<img class="pr-ava" src="' + esc(pr.user.avatar_url) + '" alt="" loading="lazy" width="40" height="40">' +
      '<div class="pr-main">' +
      '<div class="pr-title"><a href="' + esc(pr.html_url) + '">' + esc(pr.title) + "</a></div>" +
      '<div class="pr-sub">#' + pr.number + " · by " + who + " · updated " + age + "d ago · " +
      (pr.commits || 1) + " commit(s)</div>" +
      '<div class="pr-state">' + (labels || '<span class="lbl lbl-gray">community-level</span>') + "</div>" +
      "</div></div>"
    );
  }

  var failures = 0;
  function boardFail(el, which) {
    failures++;
    if (failures >= 2) {
      // both live lists unavailable — one calm, designed strip instead of two error boxes
      $("#pr-board").innerHTML =
        '<div class="live-strip"><b>live GitHub data is resting</b>' +
        '<span>anonymous tabs get 60 API requests/hour per IP and this one is spent — ' +
        'the pipeline itself is fine. Browse the ' +
        '<a href="https://github.com/' + REPO + '/pulls">pull requests on GitHub</a> directly, or reload later.</span></div>';
      $("#pr-merged").innerHTML = "";
      var h = $("#merged-heading");
      if (h) h.style.display = "none";
      return;
    }
    el.innerHTML =
      '<div class="live-strip"><b>' + which + ": live data resting</b>" +
      "<span>the public GitHub API politely limits anonymous tabs — browse the " +
      '<a href="https://github.com/' + REPO + '/pulls">pull requests on GitHub</a> directly.</span></div>';
  }

  window.WyrmCommunity = function () {
    /* ── live PR board ─────────────────────────────────────────────── */
    var board = $("#pr-board");
    gh("/repos/" + REPO + "/pulls?state=open&per_page=30")
      .then(function (prs) {
        var community = prs.filter(function (p) {
          return (p.labels || []).some(function (l) { return l.name === "community-level"; }) ||
            /community[- ]level|level forge|forge a level|community submission/i.test(p.title);
        });
        var list = community.length ? community : prs;
        board.innerHTML = list.length
          ? list.map(function (p) { return prCard(p, "open"); }).join("")
          : '<div class="notice"><span class="n-title">the board is clear</span>no open community submissions right now — ' +
            'yours could be first: <a href="./forge.html">open the Forge</a>.</div>';
      })
      .catch(function () { boardFail(board, "open submissions"); });

    var merged = $("#pr-merged");
    gh("/repos/" + REPO + "/pulls?state=closed&sort=updated&direction=desc&per_page=20")
      .then(function (prs) {
        var done = prs.filter(function (p) { return p.merged_at; }).slice(0, 6);
        merged.innerHTML = done.length
          ? done.map(function (p) { return prCard(p, "merged"); }).join("")
          : '<div class="notice"><span class="n-title">no merges yet</span>the ladder is all-official so far — ' +
            'the first community canon is still unclaimed.</div>';
      })
      .catch(function () { boardFail(merged, "merge log"); });

    var meta = $("#board-meta");
    if (meta) meta.innerHTML = '<span class="v">source: api.github.com (live)</span><span class="v">auth: none — public data</span><span class="v">refreshed on load</span>';

    /* ── merged community levels + contributors (from the archive) ── */
    fetch("./data/index.json").then(function (r) { return r.json(); }).then(function (data) {
      var host = $("#merged-levels");
      var empty = $("#community-empty");
      var community = (data.levels || []).filter(function (l) { return l.community; });
      if (!community.length) {
        if (empty) empty.style.display = "block";
        return;
      }
      var byAuthor = {};
      community.forEach(function (l) {
        var a = l.author || "anonymous";
        (byAuthor[a] = byAuthor[a] || []).push(l);
      });
      host.innerHTML = Object.keys(byAuthor).map(function (a) {
        var ls = byAuthor[a];
        var gh2 = ls[0].contributorGithub;
        var levels = ls.map(function (l) {
          return '<a href="./run.html?m=wyrm-bfs&l=' + encodeURIComponent(l.slug) + '" style="color:var(--cream-soft)">' +
            esc(l.name) + "</a> <span style='color:var(--cream-faint)'>· " +
            (typeof l.difficulty === "number" ? l.difficulty.toFixed(1) : "?") + "/10</span>";
        }).join("<br>");
        return (
          '<div class="contrib-card">' +
          '<img class="cc-ava" src="https://github.com/' + esc(gh2 || (a === "anonymous" ? "ghost" : a)) + '.png?size=88" alt="" loading="lazy" width="44" height="44">' +
          '<div><div class="cc-name">' + esc(a) + (gh2 ? ' · <a href="https://github.com/' + esc(gh2) + '">@' + esc(gh2) + "</a>" : "") + "</div>" +
          '<div class="cc-meta">' + levels + "</div></div></div>"
        );
      }).join("");
    }).catch(function () { /* archive optional */ });
  };
})();
