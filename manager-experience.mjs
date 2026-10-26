import {
  STARTER_SLOTS,
  ESPN_SLOTS,
  optimalLineup,
  legalLineup,
  estimatedCeiling,
  kickoffTime,
  coverage,
  csvText,
} from "./lineup-tools.mjs";

export function installManagerExperience(api) {
  const {
    views,
    esc,
    fmt,
    setTab,
    el,
    playerSeason,
    playerLog,
    openPlayer,
    showToast,
  } = api;
  let research = null,
    researchKey = "",
    researchError = "",
    researchPending = null,
    lastResearchAttempt = 0;
  let prefs = {
      watched_players: [],
      favorite_pages: [],
      saved_trades: [],
      alert_categories: ["league", "matchup", "trade"],
      quiet_start: null,
      quiet_end: null,
      subscription_hash: null,
      utc_offset: new Date().getTimezoneOffset(),
    },
    prefsReady = false,
    prefsBusy = false;
  let filters = {
      search: "",
      position: "",
      owner: "",
      health: "",
      bye: "",
      sort: "proj",
      watch: false,
    },
    compare = [],
    details = false;
  const data = () => api.getData(),
    me = () => api.getMe(),
    week = () => Number(data().meta.currentScoringPeriod || 1);
  const stamp = (value) => {
    const t = kickoffTime(value);
    return t
      ? new Date(t).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unavailable";
  };
  const button = (label, attrs = "", cls = "ghost") =>
    `<button ${attrs.includes('type="') ? "" : 'type="button"'} class="btn ${cls}" ${attrs}>${label}</button>`;
  const playerButton = (p) =>
    `<button type="button" class="pclick" data-pid="${p.id}">${esc(p.name)}</button>`;
  const value = (n) => (Number.isFinite(n) ? fmt(n, 1) : "—");
  const roster = (id) => data().rosters?.[id] || [];
  const knownFeed = () =>
    researchKey === `${data().meta.season}:${week()}:${data().meta.leagueId}`
      ? research
      : null;
  function slots() {
    const f = knownFeed();
    return f?.settingsVerified &&
      f.slots?.length &&
      f.slots.length <= 16 &&
      !f.unsupportedSlots?.length
      ? f.slots
      : STARTER_SLOTS;
  }
  function rosterPlayers(id) {
    return roster(id).map((p) => {
      const feed = knownFeed()?.players.find((x) => x.id === p.playerId),
        stats = playerSeason(p.playerId);
      const rawEligible = p.eligibleSlots || p.eligible;
      const eligible = feed?.eligible?.length
        ? feed.eligible
        : Array.isArray(rawEligible)
          ? rawEligible
              .map((x) => ESPN_SLOTS[x] || x)
              .filter((x) => !["BE", "IR"].includes(x))
          : undefined;
      const kick =
        kickoffTime(feed?.kickoff) ??
        kickoffTime(data().meta.proGames?.[p.proTeam]);
      return {
        ...p,
        id: p.playerId,
        pro: p.proTeam,
        eligible,
        droppable: feed?.droppable ?? null,
        proj: stats.proj ?? feed?.proj ?? null,
        avg: stats.gp ? stats.avg : (feed?.avg ?? null),
        l3: stats.gp ? stats.l3 : (feed?.l3 ?? null),
        games: stats.gp || feed?.games || 0,
        kickoff: kick,
        locked: kick != null && kick <= Date.now(),
        lockKnown: kick != null,
        unavailable:
          [
            "OUT",
            "O",
            "IR",
            "INJURY_RESERVE",
            "INJURED_RESERVE",
            "SUSPENSION",
            "SUSPENDED",
            "DOUBTFUL",
            "D",
          ].includes(String(p.injury).toUpperCase()) ||
          Number(data().meta.byeWeeks?.[p.proTeam] ?? feed?.bye) === week(),
        bye: data().meta.byeWeeks?.[p.proTeam] ?? feed?.bye ?? null,
        owner: id,
      };
    });
  }
  function plan(id, mode = "projection") {
    const players = rosterPlayers(id).map((p) => ({
      ...p,
      value:
        mode === "ceiling"
          ? estimatedCeiling(
              p.proj,
              playerLog(p.id)
                .map((r) => r.pts)
                .filter(Number.isFinite),
            )
          : p.proj,
    }));
    const result = legalLineup(players, slots());
    const current = players.filter((p) => !["BE", "IR"].includes(p.slot));
    const currentKnown =
      current.length === slots().length &&
      current.every((p) => Number.isFinite(p.value));
    const currentTotal = current.reduce((s, p) => s + (p.value ?? 0), 0);
    const additions = result.picks.filter(
      (p) => !current.some((c) => c.id === p.id),
    );
    const removed = current.filter(
      (p) => !result.picks.some((c) => c.id === p.id),
    );
    const locksKnown = players
      .filter((p) => p.slot !== "IR" && !p.unavailable)
      .every((p) => p.lockKnown);
    const settings = knownFeed();
    const verified =
      !!settings?.settingsVerified &&
      !settings.unsupportedSlots?.length &&
      settings.slots.length > 0 &&
      settings.slots.length <= 16;
    return {
      ...result,
      players,
      current,
      currentKnown,
      currentTotal,
      additions,
      removed,
      locksKnown,
      verified,
      delta:
        currentKnown && result.complete ? result.total - currentTotal : null,
    };
  }
  function kickoff(p) {
    return p.locked
      ? "Locked"
      : p.kickoff
        ? stamp(p.kickoff)
        : "Kickoff unconfirmed";
  }
  function lineup(id) {
    return `<section class="card card-p mx-lineup"><div class="mx-heading"><div><div class="eyebrow">Before kickoff</div><h3>Lineup Lab · Week ${week()}</h3></div><a class="btn ghost" href="https://fantasy.espn.com/football/team?leagueId=${encodeURIComponent(data().meta.leagueId)}&teamId=${id}&seasonId=${data().meta.season}" target="_blank" rel="noopener">Open ESPN</a></div><p class="metricnote">Set your lineup in ESPN. Started players stay in their current slots; locked bench players stay on the bench.</p>${[
      "projection",
      "ceiling",
    ]
      .map((mode, i) => {
        const p = plan(id, mode),
          safe = p.locksKnown && p.verified;
        return `<details class="fold" data-lineup-mode="${mode}" data-lineup-team="${id}" ${i === 0 && plan(id).additions.length ? "open" : ""}><summary>${i === 0 ? "Best projected starters" : "Highest estimated ceiling"} <b class="num">${value(p.total)}${p.complete ? "" : " · partial"}</b></summary><div class="fold-b">
      ${!safe ? `<p class="mx-warning">${!p.verified ? "League slot settings are unconfirmed; showing the standard lineup template. " : ""}${!p.locksKnown ? "Some kickoff times are unconfirmed. " : ""}Verify these suggestions in ESPN before making changes.</p>` : ""}
      ${p.delta != null && safe ? `<p class="mx-delta">${p.delta > 0 ? "+" : ""}${value(p.delta)} projected points vs your current lineup</p>` : ""}
      ${
        p.additions.length
          ? `<div class="mx-swap"><b>${safe ? "Lineup changes" : "Compare these options"}</b><p>In: ${p.additions.map((x) => esc(x.name)).join(", ")}<br>Out: ${p.removed.map((x) => esc(x.name)).join(", ") || "Empty slots"}</p>${button(
              "Compare players",
              `data-mx-compare="${[...p.additions, ...p.removed]
                .slice(0, 4)
                .map((x) => x.id)
                .join(",")}"`,
            )}</div>`
          : p.complete
            ? "<p>Your current starters already match this selection.</p>"
            : ""
      }
      <details class="fold"><summary>Full suggested lineup</summary>${p.picks.map((x) => `<div class="mx-line"><span class="posbadge">${x.assignedSlot}</span>${playerButton(x)}<small>${kickoff(x)}</small><b class="num">${value(x.value)}</b></div>`).join("") || "<p>No eligible players with available data.</p>"}</details>
      ${!p.complete ? `<p class="metricnote">${p.picks.length} of ${slots().length} slots filled${p.missing ? `; ${p.missing} locked starter projection(s) missing` : ""}. Total is partial.</p>` : ""}
      <p class="metricnote">${mode === "ceiling" ? "Estimated ceiling = projection + 1.28 × recorded weekly standard deviation, with at least three games. Estimates are per player; the sum is not a team confidence bound." : "Uses available weekly projections and position eligibility. Unavailable players and byes are excluded from new selections. Missing projections are omitted."}</p></div></details>`;
      })
      .join("")}</section>`;
  }
  function fresh() {
    const updated = kickoffTime(data().meta.lastUpdated),
      old = !updated || Date.now() - updated > 10 * 60000;
    const feed = knownFeed();
    const feedOld = feed && (!kickoffTime(research.updatedAt) || Date.now() - kickoffTime(research.updatedAt) > 10 * 60000);
    const warning=old || feedOld || researchError || api.getRefreshError();
    return `<details class="mx-fresh ${old || feedOld || researchError || api.getRefreshError() ? "mx-warning" : ""}" ><summary>${warning?"Data needs attention":"Data status"} · ${stamp(data().meta.lastUpdated)}</summary><div role="status"><span>League data: ${stamp(data().meta.lastUpdated)}${old ? " · data over 10 minutes old" : ""}${api.getRefreshError() ? " · last refresh failed; showing previous data" : ""}</span><span>Player feed: ${feed ? stamp(research.updatedAt) : researchPending ? "Loading…" : researchError ? "Unavailable" : "Not loaded"}${feedOld ? " · data over 10 minutes old" : ""}${feed && researchError ? " · last refresh failed; showing previous data" : ""}${feed && researchPending ? " · refreshing…" : ""}</span><button class="wi-reset" type="button" data-mx-refresh>Refresh</button></div></details>`;
  }
  function updateFreshness() {
    document.querySelectorAll("#app .mx-fresh").forEach((node) => {
      const open=node.open;node.outerHTML = fresh();if(open)document.querySelector("#app .mx-fresh").open=true;
    });
  }
  function weeklyCenter() {
    const id = me();
    if (id == null || !data().teams.some((t) => t.id === id))
      return `<section class="card card-p mx-center"><div class="eyebrow">Your weekly edge</div><h2>One team. Everything to watch.</h2><p>Choose your team to see lineup checks, player comparisons and your next roster needs.</p>${button("Choose my team", "data-mx-pick", "")}</section>`;
    const p = plan(id),
      players = p.players,
      starter = players.filter((p) => !["BE", "IR"].includes(p.slot)),
      warnings = starter.filter((x) => x.unavailable && !x.locked);
    const empty = Math.max(0, slots().length - starter.length),
      upcoming = players
        .filter((x) => !x.locked && x.kickoff)
        .sort((a, b) => a.kickoff - b.kickoff)[0];
    const phase = players.some((x) => x.locked)
      ? "Game week is moving"
      : new Date().getDay() <= 3
        ? "Build your week"
        : "Get ready for kickoff";
    const issues = [
      ...warnings.map(
        (x) =>
          `${x.name}: ${
            Number(x.bye) === week()
              ? "on bye"
              : String(x.injury || "unavailable")
                  .replaceAll("_", " ")
                  .toLowerCase()
          }`,
      ),
      ...(empty
        ? [`${empty} empty starting slot${empty === 1 ? "" : "s"}`]
        : []),
    ];
    return `<section class="card card-p mx-center" data-roster-issues="${issues.length}"><div class="mx-heading"><div><div class="eyebrow">${phase} · Week ${week()}</div><h2>This week, ${esc(data().teams.find((t) => t.id === id)?.owner || "manager")}.</h2></div><span class="pill ${issues.length ? "l" : "w"}">${issues.length ? `${issues.length} to check` : "Roster check"}</span></div>${issues.length ? `<ul class="mx-alerts">${issues.slice(0,3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>${issues.length>3?`<p class="metricnote">${issues.length-3} more issues · review your lineup for all alerts.</p>`:""}` : "<p>No empty slots or unavailable unlocked starters found.</p>"}${upcoming ? `<p class="metricnote">Next roster kickoff: ${stamp(upcoming.kickoff)}. Players lock at their individual game times.</p>` : '<p class="metricnote">Check player lock times in ESPN before making changes.</p>'}<div class="mx-actions">${button("Review my lineup", 'data-mx-go="myteam"', "")}${button("Find a replacement", `data-mx-waivers data-mx-position="${esc(warnings[0]?.pos||"")}"`)}${button("My matchup", 'data-mx-go="matchup"')}${button("Watchlist", "data-mx-watchlist")}</div>${fresh()}</section>`;
  }
  function allPlayers() {
    const map = new Map();
    for (const p of knownFeed()?.players || []) map.set(p.id, p);
    for (const t of data().teams)
      for (const p of rosterPlayers(t.id))
        map.set(p.id, { ...map.get(p.id), ...p, availability: "ROSTERED" });
    for (const [id, p] of Object.entries(data().players || {}))
      if (!map.has(+id)) {
        const s = playerSeason(+id);
        map.set(+id, {
          id: +id,
          name: p[0],
          pos: p[1],
          pro: p[2],
          owner: null,
          availability: null,
          avg: s.gp ? s.avg : null,
          l3: s.gp ? s.l3 : null,
          proj: s.proj,
          games: s.gp,
          bye: data().meta.byeWeeks?.[p[2]] ?? null,
        });
      }
    return [...map.values()];
  }
  function ownership(p) {
    return p.owner != null
      ? data().teams.find((t) => t.id === p.owner)?.name || "Rostered"
      : p.availability === "FREEAGENT"
        ? "Free agent"
        : p.availability === "WAIVERS"
          ? "On waivers"
          : "Availability unconfirmed";
  }
  async function ensureResearch(force = false) {
    const key = `${data().meta.season}:${week()}:${data().meta.leagueId}`;
    if (researchPending) return researchPending;
    if (
      !force &&
      researchKey === key &&
      research &&
      Date.now() - Date.parse(research.updatedAt) < 300000
    )
      return;
    if (!force && Date.now() - lastResearchAttempt < 30000) return;
    lastResearchAttempt = Date.now();
    researchError = "";
    researchPending = (async () => {
      try {
        const q = new URLSearchParams({
          season: data().meta.season,
          week: week(),
          league: data().meta.leagueId,
        });
        const r = await fetch("/api/player-research?" + q);
        if (!r.ok) throw new Error();
        const result = await r.json();
        if (!Array.isArray(result.players)) throw new Error();
        research = result;
        researchKey = key;
      } catch {
        researchError =
          "Player feed unavailable. League roster research still works.";
      } finally {
        researchPending = null;
        if (
          ["players", "faab", "dash", "myteam"].includes(api.getCurrent()) &&
          !document.querySelector(
            "#app input:focus,#app select:focus,#app textarea:focus",
          )
        )
          setTab(api.getCurrent());
      }
    })();
    return researchPending;
  }
  async function preferences() {
    try {
      let device = api.getDevice();
      if (!device) return;
      document.cookie = `mfl_preferences=${encodeURIComponent(device)}; Path=/; Max-Age=31536000; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
      const r = await fetch("/api/manager-preferences");
      if (!r.ok) throw new Error();
      const p = await r.json();
      prefs = { ...prefs, ...p };
      prefsReady = true;
      if (
        ["players", "dash", "trade"].includes(api.getCurrent()) &&
        !document.querySelector("#app input:focus")
      )
        setTab(api.getCurrent());
    } catch {
      prefsReady = false;
    }
  }
  async function savePreferences(change) {
    if (prefsBusy) return;
    if (!prefsReady) {
      showToast("Preferences unavailable. Retrying…");
      await preferences();
      if (!prefsReady) {
        showToast("Could not load browser preferences. Try again shortly.");
        return;
      }
    }
    prefsBusy = true;
    try {
      const sub = await api.getSubscription().catch(() => null);
      const subscription_hash = sub
        ? Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(sub.endpoint),
              ),
            ),
          )
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("")
        : null;
      const next = {
        ...prefs,
        ...change,
        subscription_hash,
        utc_offset: new Date().getTimezoneOffset(),
      };
      const r = await fetch("/api/manager-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error();
      prefs = next;
      showToast("Saved for this browser");
      if (["players", "dash", "trade"].includes(api.getCurrent()))
        setTab(api.getCurrent());
    } catch {
      showToast("Could not save. Your saved preferences are unchanged.");
    } finally {
      prefsBusy = false;
    }
  }
  function playerTable(rows, waivers = false) {
    return `<div class="twrap mx-player-table"><table><thead><tr><th>Player</th><th class="mx-secondary">${waivers ? "Roster gain" : "Team / status"}</th><th>Proj</th><th class="mx-extra">Season avg</th><th class="mx-extra">Last 3</th><th class="mx-extra">Games</th><th>Research</th></tr></thead><tbody>${rows.map((p) => `<tr><td><span class="posbadge">${esc(p.pos)}</span> ${playerButton(p)}<div class="manager-ownership">${esc(ownership(p))}</div><div class="metricnote">${kickoffTime(p.kickoff)?(kickoffTime(p.kickoff)<=Date.now()?"Game started":"Kickoff "+stamp(p.kickoff)):"Kickoff unconfirmed"}</div><div class="metricnote">${esc(p.pro)}${p.injury && !["ACTIVE", "NORMAL"].includes(p.injury) ? " · " + esc(api.injLabel(p.injury)) : ""}${p.bye ? " · Bye W" + p.bye : ""}${waivers && p.gain != null ? " · " + (p.gain >= 0 ? "+" : "") + value(p.gain) + " projected lineup pts" : ""}${waivers && p.bid ? " · Planning bid " + esc(p.bid) : ""}</div></td><td class="mx-secondary">${waivers ? `${p.gain == null ? "—" : (p.gain > 0 ? "+" : "") + value(p.gain)}<div class="metricnote">${esc(ownership(p))}</div>` : esc(ownership(p))}</td><td class="num">${value(p.proj)}</td><td class="num mx-extra">${value(p.avg)}</td><td class="num mx-extra">${value(p.l3)}</td><td class="num mx-extra">${p.games || "—"}</td><td><div class="mx-actions">${button(compare.includes(p.id) ? "Compared" : "Compare", `data-mx-add="${p.id}" aria-pressed="${compare.includes(p.id)}"`)}${button(prefs.watched_players.includes(p.id) ? "Watching" : "Watch", `data-mx-watch="${p.id}" aria-pressed="${prefs.watched_players.includes(p.id)}"`)}</div></td></tr>`).join("") || `<tr><td colspan="7">No players match these filters.</td></tr>`}</tbody></table></div>`;
  }
  function comparison() {
    const list = allPlayers(),
      players = compare
        .map((id) => list.find((p) => p.id === id))
        .filter(Boolean);
    if (!players.length)
      return '<div class="helpbox">Select up to four players to compare projections, recent form and availability.</div>';
    const metrics = [
      ["This week", (p) => value(p.proj)],
      ["Season avg", (p) => value(p.avg)],
      ["Last 3 recorded", (p) => value(p.l3)],
      ["Recorded games", (p) => p.games || "—"],
      [
        "Best / low",
        (p) => {
          const pts = (p.log?.length ? p.log : playerLog(p.id))
            .map((r) => r.pts)
            .filter(Number.isFinite);
          return pts.length
            ? value(Math.max(...pts)) + " / " + value(Math.min(...pts))
            : "—";
        },
      ],
      ["Status", (p) => esc(p.injury ? api.injLabel(p.injury) : "—")],
      ["Bye", (p) => (p.bye ? "W" + p.bye : "—")],
      ["Kickoff", (p) => stamp(p.kickoff)],
      ["Fantasy team", (p) => esc(ownership(p))],
    ];
    return `<section class="card card-p mx-comparison" id="mxComparison"><div class="mx-heading"><h3>Side by side</h3><div class="mx-actions">${button("Clear", "data-mx-clear")}</div></div><div class="twrap"><table><thead><tr><th>League scoring</th>${players.map((p) => `<th>${playerButton(p)} ${button("Remove", `data-mx-add="${p.id}" aria-label="Remove ${esc(p.name)} from comparison"`)}</th>`).join("")}</tr></thead><tbody>${metrics.map(([label, render]) => `<tr><th>${label}</th>${players.map((p) => `<td>${render(p)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="metricnote">Roster history uses recorded league weeks. Expanded feed averages use available ESPN weekly records through Week ${week() - 1}; neither substitutes for missing games. Missing data stays blank.</p></section>`;
  }
  views.players = () => {
    void ensureResearch();
    const v = el(
      `<div class="shead"><div><div class="eyebrow">The scouting desk</div><h2>Players</h2></div>${button("Share this view", "data-mx-share")}</div><p class="metricnote">Find a name, compare your options, keep an eye on what changes.</p><form class="mx-filters" id="mxFilters"><label>Search players<input type="search" name="search" value="${esc(filters.search)}" placeholder="Name or NFL team" autocomplete="off"></label><label>Position<select name="position"><option value="">All positions</option>${["QB", "RB", "WR", "TE", "K", "DST"].map((p) => `<option ${filters.position === p ? "selected" : ""}>${p}</option>`).join("")}</select></label><label>Fantasy team<select name="owner"><option value="">All players</option><option value="available" ${filters.owner === "available" ? "selected" : ""}>Available players</option>${data()
        .teams.map(
          (t) =>
            `<option value="${t.id}" ${String(t.id) === filters.owner ? "selected" : ""}>${esc(t.name)}</option>`,
        )
        .join(
          "",
        )}</select></label><label class="mx-filter-extra">Health<select name="health"><option value="">All statuses</option><option value="flagged" ${filters.health === "flagged" ? "selected" : ""}>Injury flag</option><option value="clear" ${filters.health === "clear" ? "selected" : ""}>No injury flag</option></select></label><label class="mx-filter-extra">Bye week<select name="bye"><option value="">Any week</option>${Array.from({ length: 18 }, (_, i) => `<option value="${i + 1}" ${filters.bye === String(i + 1) ? "selected" : ""}>Week ${i + 1}</option>`).join("")}</select></label><label class="mx-filter-extra">Sort by<select name="sort">${[
        ["proj", "This week"],
        ["avg", "Season average"],
        ["l3", "Last 3 recorded"],
      ]
        .map(
          ([k, l]) =>
            `<option value="${k}" ${filters.sort === k ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></label><label class="mx-check"><input type="checkbox" name="watch" ${filters.watch ? "checked" : ""}> Watchlist</label>${button("More filters", 'data-mx-filter-toggle aria-expanded="false"')}${button("Reset", "data-mx-reset")}</form><div id="mxResearchStatus" role="status"></div><div class="mx-heading"><span id="mxPlayerCount" class="metricnote"></span><div class="mx-actions">${button(details ? "Compact columns" : "More columns", "data-mx-columns")}${button("Export CSV", "data-mx-export-players")}</div></div>${comparison()}<div id="mxPlayers"></div>${fresh()}`,
    );
    const render = () => {
      const rows = filteredPlayers();
      v.querySelector("#mxPlayerCount").textContent =
        `${rows.length} players${rows.length > 100 ? " · first 100 shown; refine your search" : ""}`;
      const list = v.querySelector("#mxPlayers");
      list.innerHTML = playerTable(rows.slice(0, 100));
      list.classList.toggle("mx-expanded", details);
      v.querySelector("#mxResearchStatus").innerHTML = researchError
        ? `<p class="mx-warning">${researchError} ${button("Retry", "data-mx-refresh")}</p>`
        : researchPending
          ? '<p class="metricnote">Loading expanded ESPN player pool…</p>'
          : "";
    };
    const form = v.querySelector("#mxFilters");
    const more = form.querySelector("[data-mx-filter-toggle]");
    const expanded = !!(
      filters.health ||
      filters.bye ||
      filters.sort !== "proj"
    );
    form.classList.toggle("mx-filter-expanded", expanded);
    more.setAttribute("aria-expanded", String(expanded));
    more.textContent = expanded ? "Fewer filters" : "More filters";
    more.onclick = () => {
      const expanded = form.classList.toggle("mx-filter-expanded");
      more.setAttribute("aria-expanded", String(expanded));
      more.textContent = expanded ? "Fewer filters" : "More filters";
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      readFilters(form);
      render();
      updateUrl();
    };
    form.querySelector("[name=search]").oninput = () => {
      readFilters(form);
      render();
      updateUrl();
    };
    form.querySelectorAll("select,input[type=checkbox]").forEach(
      (n) =>
        (n.onchange = () => {
          readFilters(form);
          render();
          updateUrl();
        }),
    );
    v.querySelector("[data-mx-columns]").onclick = (e) => {
      details = !details;
      v.querySelector("#mxPlayers").classList.toggle("mx-expanded", details);
      e.currentTarget.textContent = details
        ? "Compact columns"
        : "More columns";
    };
    render();
    return v;
  };
  function readFilters(form) {
    const f = new FormData(form);
    filters = {
      search: String(f.get("search") || ""),
      position: String(f.get("position") || ""),
      owner: String(f.get("owner") || ""),
      health: String(f.get("health") || ""),
      bye: String(f.get("bye") || ""),
      sort: String(f.get("sort") || "proj"),
      watch: f.get("watch") === "on",
    };
  }
  function filteredPlayers() {
    return allPlayers()
      .filter(
        (p) =>
          `${p.name} ${p.pro}`
            .toLowerCase()
            .includes(filters.search.toLowerCase()) &&
          (!filters.position || p.pos === filters.position) &&
          (!filters.owner ||
            (filters.owner === "available"
              ? ["FREEAGENT", "WAIVERS"].includes(p.availability)
              : String(p.owner) === filters.owner)) &&
          (!filters.health ||
            (filters.health === "flagged") ===
              !!(p.injury && !["ACTIVE", "NORMAL"].includes(p.injury))) &&
          (!filters.bye || Number(p.bye) === Number(filters.bye)) &&
          (!filters.watch || prefs.watched_players.includes(p.id)),
      )
      .sort(
        (a, b) =>
          (b[filters.sort] ?? -Infinity) - (a[filters.sort] ?? -Infinity) ||
          a.name.localeCompare(b.name),
      );
  }
  function coveragePanel(id) {
    const players = rosterPlayers(id),
      weeks = Array.from(
        {
          length: Math.min(
            5,
            Math.max(
              0,
              Math.min(18, Number(data().meta.regularSeasonWeeks || 14)) -
                week() +
                1,
            ),
          ),
        },
        (_, i) => week() + i,
      );
    return `<section class="card card-p"><div class="eyebrow">Plan ahead</div><h3>Roster coverage</h3><p class="metricnote">Available coverage from today's roster, including bench depth. Future weeks model NFL byes; today's injury flags apply only to this week.</p>${weeks
      .map((w) => {
        const missing = coverage(
          players.map((p) => ({
            ...p,
            unavailable: Number(p.bye) === w || (w === week() && p.unavailable),
          })),
          slots(),
        );
        return `<div class="mx-line"><b>Week ${w}</b><span>${missing.length ? "Needs " + missing.map(esc).join(", ") : "Every slot covered"}</span>${missing.length ? button("Find options", `data-mx-waivers data-mx-position="${["QB", "RB", "WR", "TE", "DST", "K"].includes(missing[0]) ? missing[0] : ""}"`) : ""}</div>`;
      })
      .join(
        "",
      )}${!knownFeed()?.settingsVerified ? '<p class="metricnote">Standard lineup template until league settings are confirmed.</p>' : ""}</section>`;
  }
  function waiverPanel() {
    const id = me(),
      f = knownFeed(),
      pool = (f?.players || []).filter(
        (p) =>
          ["FREEAGENT", "WAIVERS"].includes(p.availability) &&
          (!filters.position || p.pos === filters.position) &&
          ![
            "OUT",
            "INJURY_RESERVE",
            "INJURED_RESERVE",
            "SUSPENSION",
            "SUSPENDED",
            "DOUBTFUL",
          ].includes(p.injury) &&
          Number(p.bye) !== week(),
      );
    const base = id != null ? rosterPlayers(id) : [],
      baseline = legalLineup(
        base.map((p) => ({ ...p, value: p.proj })),
        slots(),
      );
    const candidates = pool
      .slice()
      .sort((a, b) => (b.proj ?? -Infinity) - (a.proj ?? -Infinity))
      .slice(0, 100);
    const remainingBudget = data().faab?.teams?.find(
      (t) => t.teamId === id,
    )?.remaining;
    const rows = candidates
      .map((p) => {
        const kick = kickoffTime(p.kickoff);
        const after = legalLineup(
          [
            ...base.map((p) => ({ ...p, value: p.proj })),
            {
              ...p,
              playerId: p.id,
              value: p.proj,
              slot: "BE",
              locked: kick != null && kick <= Date.now(),
            },
          ],
          slots(),
        );
        const gain =
          baseline.complete && after.complete
            ? after.total - baseline.total
            : null;
        const range =
          gain > 5 ? [0.08, 0.15] : gain > 2 ? [0.03, 0.08] : [0, 0.03];
        return {
          ...p,
          gain,
          bid:
            Number.isFinite(remainingBudget) && gain > 0
              ? "$" +
                Math.floor(remainingBudget * range[0]) +
                "–$" +
                Math.ceil(remainingBudget * range[1])
              : null,
        };
      })
      .sort(
        (a, b) =>
          (b.gain ?? -Infinity) - (a.gain ?? -Infinity) ||
          (b.proj ?? -Infinity) - (a.proj ?? -Infinity),
      )
      .slice(0, 30);
    const drop = base
      .filter(
        (p) =>
          p.slot === "BE" &&
          !p.locked &&
          p.lockKnown &&
          p.droppable === true &&
          !baseline.picks.some((x) => x.id === p.id) &&
          Number.isFinite(p.proj),
      )
      .sort((a, b) => a.proj - b.proj)[0];
    return `<section class="card card-p"><div class="mx-heading"><div><div class="eyebrow">League-specific options</div><h3>Find your next pickup</h3></div>${button("Player research", 'data-mx-go="players"')}</div><div class="mx-actions">${["", "QB", "RB", "WR", "TE", "DST", "K"].map((p) => button(p || "All", `data-mx-stream="${p}" aria-pressed="${filters.position === p}"`, filters.position === p ? "" : "ghost")).join("")}</div><p class="metricnote">${id != null ? "Roster gain compares the best projected lineup with and without each pickup. " : "Choose your team for roster-specific gains. "}Verify waiver status, roster limits and locks in ESPN. Gains are unavailable when projections are incomplete. Adding a player may require a drop.</p>${researchError ? `<p class="mx-warning">${researchError} ${button("Retry", "data-mx-refresh")}</p>` : researchPending ? '<p role="status">Loading available players…</p>' : ""}${!f && !researchPending ? "<p>Expanded player data is unavailable.</p>" : f && !pool.length ? "<p>No confirmed available players match this position.</p>" : ""}${drop ? `<div class="mx-swap"><b>Review a potential drop</b><p>${esc(drop.name)} is the lowest projected unlocked bench option outside your recommended starters. Consider longer-term value before dropping.</p>${button("Compare against a pickup", `data-mx-compare="${drop.id}"`)}</div>` : ""}${rows.length ? playerTable(rows.slice(0,5), true) : ""}${rows.length>5?`<details class="fold"><summary>More pickup options (${rows.length-5})</summary>${playerTable(rows.slice(5),true)}</details>`:""}<p class="metricnote">Planning bids use 0–3%, 3–8%, or 8–15% of remaining FAAB as projected lineup gain rises. These are budget heuristics, not predicted winning bids. Check the league minimum bid and prioritize future value. Sorted within the returned ESPN player pool. Projections do not account for a successful waiver claim. FAAB bid history is unavailable, so no league-derived bid price is implied.</p></section>${id != null ? coveragePanel(id) : ""}`;
  }
  const home = views.dash;
  views.dash = () => {
    void ensureResearch();
    const v = home();
    v.querySelector(".shead")?.remove();
    if (me() == null) v.querySelector(".hero-pick")?.remove();
    const matchup = v.querySelector(".hero.hx[data-mid]");
    if (matchup) {
      v.prepend(matchup);
      matchup.insertAdjacentHTML("afterend", weeklyCenter());
    } else {
      v.insertAdjacentHTML("afterbegin", weeklyCenter());
    }
    const watched = allPlayers()
      .filter((p) => prefs.watched_players.includes(p.id))
      .slice(0, 4);
    if (watched.length) {
      const pulse = document.createElement("section");
      pulse.className = "card card-p";
      pulse.innerHTML = `<div class="mx-heading"><div><div class="eyebrow">Keep an eye on</div><h3>Your watchlist</h3></div>${button("View watchlist", "data-mx-watchlist")}</div>${watched.map((p) => `<div class="mx-line">${playerButton(p)}<span>${esc(p.pos)} · ${esc(p.pro)}</span><b>${value(p.proj)} proj</b><small>${esc(api.injLabel(p.injury) || "")} ${p.bye === week() ? "· Bye this week" : ""}</small></div>`).join("")}`;
      v.querySelector(".mx-center")?.after(pulse);
    }
    const center=v.querySelector('.mx-center');
    if(center?.dataset.rosterIssues==='0'){
      const fold=document.createElement('details');fold.className='fold manager-fold weekly-checks';fold.dataset.sectionKey='weekly-checks';
      fold.innerHTML='<summary>This week · no roster problems</summary>';
      center.before(fold);fold.append(center);
    }
    return v;
  };
  const myTeam = views.myteam;
  views.myteam = () => {
    void ensureResearch();
    const v = myTeam(),
      id = me();
    if (id != null) {
      const old = v.querySelector("[data-lineup-mode]")?.closest("section");
      if (old) old.outerHTML = lineup(id);
      const rosterCard = [...v.querySelectorAll(".card")].find((n) =>
        n.querySelector(".rrow"),
      );
      if (rosterCard)
        rosterCard.insertAdjacentHTML("afterend", coveragePanel(id));
      const parlay = v.querySelector(".manager-history");
      if (parlay) {
        const fold = document.createElement("details");
        fold.className = "fold";
        fold.innerHTML = "<summary>Manager parlay history</summary>";
        parlay.replaceWith(fold);
        fold.appendChild(parlay);
        fold.parentElement.appendChild(fold);
      }
    }
    return v;
  };
  const waivers = views.faab;
  views.faab = () => {
    void ensureResearch();
    const v = waivers();
    const history=document.createElement("details");history.className="fold card card-p";history.innerHTML="<summary>FAAB spending & pickup history</summary>";
    while(v.firstChild) history.appendChild(v.firstChild);v.appendChild(history);
    v.insertAdjacentHTML("afterbegin", waiverPanel());
    const id=me(), budget=data().faab?.teams?.find(t=>t.teamId===id);
    if(id!=null) v.insertAdjacentHTML("afterbegin",`<div class="mx-heading"><h2>Waivers</h2><a class="btn ghost" href="https://fantasy.espn.com/football/players/add?leagueId=${encodeURIComponent(data().meta.leagueId)}&teamId=${id}&seasonId=${data().meta.season}" target="_blank" rel="noopener">Open ESPN waivers</a></div><p class="metricnote">${budget?`$${budget.remaining} FAAB remaining · `:""}Verify claim timing and availability in ESPN.</p>`);
    return v;
  };

  const originalTrade = views.trade;
  views.trade = () => {
    void ensureResearch();
    const v = originalTrade(),
      t = api.getTrade(),
      saved = prefs.saved_trades || [];
    const section = document.createElement("section");
    section.className = "card card-p";
    section.innerHTML = `<div class="mx-heading"><div><div class="eyebrow">Come back to a deal</div><h3>Saved comparisons</h3></div>${button("Save this trade", "data-mx-save-trade")}</div>${saved.length ? saved.map((t, i) => `<div class="mx-line"><b>${esc(t.label)}</b>${button("Open", `data-mx-open-trade="${i}"`)}${button("Remove", `data-mx-remove-trade="${i}"`)}</div>`).join("") : '<p class="metricnote">Save up to eight trade comparisons for this browser.</p>'}`;
    v.appendChild(section);
    section.querySelector("[data-mx-save-trade]").onclick = async () => {
      if (!prefsReady) {
        await preferences();
        if (!prefsReady) {
          showToast("Saved trades unavailable. Please retry shortly.");
          return;
        }
      }
      const saved = prefs.saved_trades || [],
        t = api.getTrade(),
        picks = Object.keys(t.pick).map(Number);
      if (!picks.length) {
        showToast("Select players before saving a trade.");
        return;
      }
      if (saved.length >= 8) {
        showToast("Remove a saved trade before adding another.");
        return;
      }
      const a = data().teams.find((x) => x.id === t.a),
        b = data().teams.find((x) => x.id === t.b);
      const label = (a?.name + " / " + b?.name).slice(0, 100);
      await savePreferences({
        saved_trades: [...saved, { a: t.a, b: t.b, picks, label }],
      });
    };
    section.querySelectorAll("[data-mx-open-trade]").forEach(
      (b) =>
        (b.onclick = () => {
          const t = saved[+b.dataset.mxOpenTrade];
          api.restoreTrade(
            new URLSearchParams({ a: t.a, b: t.b, picks: t.picks.join(",") }),
          );
          setTab("trade");
        }),
    );
    section.querySelectorAll("[data-mx-remove-trade]").forEach(
      (b) =>
        (b.onclick = () =>
          savePreferences({
            saved_trades: saved.filter(
              (_, i) => i !== +b.dataset.mxRemoveTrade,
            ),
          })),
    );
    const selected = [
      ...(data().rosters[t.a] || []).filter((p) => !t.pick[p.playerId]),
      ...(data().rosters[t.b] || []).filter((p) => t.pick[p.playerId]),
    ];
    const other = [
      ...(data().rosters[t.b] || []).filter((p) => !t.pick[p.playerId]),
      ...(data().rosters[t.a] || []).filter((p) => t.pick[p.playerId]),
    ];
    const limit = knownFeed()?.rosterLimit;
    if (
      limit &&
      [selected, other].some(
        (r) => r.filter((p) => p.slot !== "IR").length > limit,
      )
    )
      v.insertAdjacentHTML(
        "afterbegin",
        '<p class="mx-warning">This package exceeds a team’s active roster capacity. Review required drops in ESPN.</p>',
      );
    if (
      Object.keys(t.pick).length &&
      [...selected, ...other].some((p) => !playerSeason(p.playerId).gp)
    )
      v.insertAdjacentHTML(
        "afterbegin",
        '<p class="mx-warning">Some players have no recorded weekly production. Historical lineup totals are partial and may understate their value.</p>',
      );
    return v;
  };
  function tradePartners() {
    const id = me(),
      rows = api.getTradeBlock(),
      mine = rows.find((r) => +r.team_id === id)?.listing,
      needs = mine?.needs || [];
    if (!needs.length) return "";
    const partners = rows
      .filter(
        (r) =>
          +r.team_id !== id &&
          Date.now() - new Date(r.updated_at).getTime() < 14 * 86400e3,
      )
      .map((r) => ({
        r,
        players: [
          ...new Set([
            ...(r.listing?.available || []),
            ...(r.listing?.openTo || []),
          ]),
        ].filter((pid) =>
          roster(r.team_id).some(
            (p) => p.playerId === pid && needs.includes(p.pos),
          ),
        ),
      }))
      .filter((x) => x.players.length)
      .slice(0, 3);
    return partners.length
      ? `<section class="card card-p"><div class="eyebrow">Matches your needs</div><h3>Start a conversation</h3>${partners.map(({ r, players }) => `<div class="mx-line"><span>${esc(data().teams.find((t) => t.id === +r.team_id)?.name || "Team")} · ${players.map((pid) => esc(allPlayers().find((p) => p.id === pid)?.name || "Player")).join(", ")}</span>${button("Compare a deal", `data-mx-partner="${r.team_id}" data-mx-picks="${players.join(",")}"`)}</div>`).join("")}</section>`
      : "";
  }
  function openResearchPlayer(pid) {
    const p = knownFeed()?.players.find((p) => p.id === pid);
    if (
      !p ||
      Object.values(data().rosters || {})
        .flat()
        .some((x) => x.playerId === pid)
    )
      return false;
    api.closeMatchup();
    const modal = document.createElement("div");
    modal.id = "mdl";
    modal.className = "mdl";
    modal.setAttribute("aria-label", p.name + " player analysis");
    modal.innerHTML = `<div class="mdl-box player-sheet"><div class="mdl-top"><div><div class="eyebrow">Player analysis</div><h2>${esc(p.name)}</h2><p class="metricnote">${esc(p.pos)} · ${esc(p.pro)} · ${esc(ownership(p))}</p></div><button type="button" class="x" aria-label="Close">✕</button></div><div class="grid g-2">${[
      ["This week projection", value(p.proj)],
      ["Season avg", value(p.avg)],
      ["Last 3 recorded", value(p.l3)],
      ["Recorded games", p.games || "—"],
    ]
      .map(
        ([label, n]) =>
          `<div class="kpi"><div class="k-label">${label}</div><div class="k-val">${n}</div></div>`,
      )
      .join(
        "",
      )}</div><p>${esc(api.injLabel(p.injury) || "")} ${p.bye ? "· Bye W" + p.bye : ""} · ${stamp(p.kickoff)}</p><div class="mx-actions">${button("Compare", `data-mx-compare="${p.id}"`)}${button(prefs.watched_players.includes(p.id) ? "Watching" : "Watch", `data-mx-watch="${p.id}"`)}</div><h3>Game log</h3><div class="twrap"><table><thead><tr><th>Week</th><th>League points</th></tr></thead><tbody>${
      (p.log || [])
        .slice()
        .reverse()
        .map((r) => `<tr><td>Week ${r.week}</td><td>${value(r.pts)}</td></tr>`)
        .join("") ||
      '<tr><td colspan="2">No weekly records available.</td></tr>'
    }</tbody></table></div><p class="metricnote">Available ESPN weekly records through Week ${week() - 1}. Missing games stay unavailable. Player feed updated ${stamp(knownFeed().updatedAt)}.</p><h3>Latest news</h3><div id="mxPlayerNews" role="status">Loading ESPN news…</div></div>`;
    modal.querySelector(".x").onclick = api.closeMatchup;
    modal.onclick = (e) => {
      if (e.target === modal) api.closeMatchup();
    };
    modal.onkeydown = (e) => {
      if (e.key === "Escape") api.closeMatchup();
    };
    document.body.appendChild(modal);
    document.body.classList.add("mdl-open");
    const q = new URLSearchParams({
      season: data().meta.season,
      week: week(),
      league: data().meta.leagueId,
      ppr: data().meta.ppr || 0,
      ids: pid,
    });
    fetch("/api/nfl-insights?" + q)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((result) => {
        if (!modal.isConnected) return;
        modal.querySelector("#mxPlayerNews").innerHTML =
          (result.news || [])
            .filter((n) => /^https:\/\/(www\.)?espn\.com\//.test(n.url))
            .map(
              (n) =>
                `<p><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.headline)}</a></p>`,
            )
            .join("") || "No recent ESPN news available.";
      })
      .catch(() => {
        if (modal.isConnected)
          modal.querySelector("#mxPlayerNews").textContent =
            "News is temporarily unavailable.";
      });
    return true;
  }
  function updateUrl(replace = true) {
    const id = api.getCurrent(),
      q = new URLSearchParams();
    if (id === "players") {
      for (const [k, v] of Object.entries(filters))
        if (v && v !== "proj") q.set(k, String(v));
      if (compare.length) q.set("compare", compare.join(","));
      const existing = new URLSearchParams(location.hash.split("?")[1] || "");
      if (existing.has("player")) q.set("player", existing.get("player"));
    }
    const target = "#" + id + (q.size ? "?" + q : "");
    if (location.hash !== target)
      history[replace ? "replaceState" : "pushState"](null, "", target);
  }
  function route() {
    const [page, query = ""] = location.hash.slice(1).split("?"),
      q = new URLSearchParams(query);
    if (page === "players") {
      const pos = q.get("position") || "";
      filters = {
        search: (q.get("search") || "").slice(0, 100),
        position: ["QB", "RB", "WR", "TE", "DST", "K"].includes(pos) ? pos : "",
        owner: q.get("owner") || "",
        health: q.get("health") || "",
        bye: q.get("bye") || "",
        sort: ["avg", "l3"].includes(q.get("sort")) ? q.get("sort") : "proj",
        watch: q.get("watch") === "true",
      };
      compare = (q.get("compare") || "")
        .split(",")
        .map(Number)
        .filter((x) => Number.isInteger(x) && x > 0)
        .slice(0, 4);
    }
    if (page === "teams" && q.has("team")) {
      const id = Number(q.get("team"));
      if (data().teams.some((t) => t.id === id))
        setTimeout(() => api.goTeam(id), 0);
    }
    if (page === "trade" && q.has("a")) api.restoreTrade(q);
    if (page === "matchup" && q.has("week"))
      api.restoreWeek(Number(q.get("week")));
    if (q.has("player")) {
      const pid = Number(q.get("player"));
      if (Number.isInteger(pid) && pid > 0)
        setTimeout(async () => {
          if (
            !Object.values(data().rosters || {})
              .flat()
              .some((p) => p.playerId === pid)
          )
            await ensureResearch();
          const current = new URLSearchParams(
            location.hash.split("?")[1] || "",
          ).get("player");
          if (Number(current) === pid) openPlayer(pid);
        }, 0);
    }
  }
  async function share() {
    if (api.getCurrent() === "players") updateUrl();
    try {
      if (navigator.share)
        await navigator.share({
          title: "MFL · " + (api.labels[api.getCurrent()] || "League"),
          url: location.href,
        });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(location.href);
        showToast("Link copied");
      } else showToast("Copy this page address to share");
    } catch (e) {
      if (e.name !== "AbortError") showToast("Copy this page address to share");
    }
  }
  function download(rows, name) {
    const url = URL.createObjectURL(
      new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function enhanceView(root) {
    api.enhanceLayout?.(root);
    api.enhanceTables?.(root);
    if(!root.querySelector(".mx-fresh"))root.insertAdjacentHTML("beforeend",fresh());
    // Turn static team targets into keyboard-operable controls without changing visual styling.
    root.querySelectorAll("[data-tid]:not(button):not(a)").forEach((n) => {
      if (n.closest("button,a,[data-mid],[data-goto],[data-team]")) return;
      n.tabIndex = 0;
      n.setAttribute("role", "button");
      n.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          n.click();
        }
      };
    });
    root.querySelectorAll(".pclick:not(button):not(a)").forEach((n) => {
      n.tabIndex = 0;
      n.setAttribute("role", "button");
      n.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          n.click();
        }
      };
    });
    root.querySelectorAll(".sub-h[title]").forEach((n) => {
      if (n.querySelector(".mx-help")) return;
      const text = n.title;
      n.removeAttribute("title");
      n.querySelector(".qi")?.remove();
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mx-help";
      b.textContent = "?";
      b.setAttribute("aria-label", "Explain this metric");
      b.setAttribute("aria-expanded", "false");
      const p = document.createElement("p");
      p.className = "metricnote";
      p.hidden = true;
      p.textContent = text;
      b.onclick = () => {
        p.hidden = !p.hidden;
        b.setAttribute("aria-expanded", String(!p.hidden));
      };
      n.appendChild(b);
      n.after(p);
    });
    root.querySelectorAll(".twrap").forEach((n) => {
      if (!n.querySelector("table")) return;
      n.tabIndex = 0;
      n.setAttribute("role", "region");
      n.setAttribute("aria-label", "Statistics table, scroll for more columns");
    });
    root
      .querySelectorAll(".twrap table")
      .forEach((t) => t.classList.add("mx-sticky"));
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(
      "[data-mx-go],[data-mx-pick],[data-mx-refresh],[data-mx-add],[data-mx-compare],[data-mx-watch],[data-mx-clear],[data-mx-share],[data-mx-waivers],[data-mx-stream],[data-mx-export],[data-mx-export-players],[data-mx-favorite],[data-mx-reset],[data-mx-watchlist],[data-mx-partner]",
    );
    if (!b) return;
    if (b.hasAttribute("data-mx-partner")) {
      api.restoreTrade(
        new URLSearchParams({
          a: me(),
          b: b.dataset.mxPartner,
          picks: b.dataset.mxPicks,
        }),
      );
      setTab("trade");
    } else if (b.hasAttribute("data-mx-go")) setTab(b.dataset.mxGo);
    else if (b.hasAttribute("data-mx-pick")) api.pickTeam();
    else if (b.hasAttribute("data-mx-refresh")) {
      b.disabled = true;
      await Promise.allSettled([ensureResearch(true), api.refreshData()]);
      b.disabled = false;
      updateFreshness();
      showToast(
        api.getRefreshError()
          ? "League refresh failed; showing previous data"
          : researchError
          ? "Player feed unavailable; retry shortly"
          : "Refresh checked",
      );
    } else if (b.hasAttribute("data-mx-add")) {
      const id = Number(b.dataset.mxAdd);
      if (compare.includes(id)) compare = compare.filter((x) => x !== id);
      else if (compare.length < 4) compare.push(id);
      else {
        showToast("Compare up to four players. Remove one first.");
        return;
      }
      setTab("players");
      updateUrl();
    } else if (b.hasAttribute("data-mx-compare")) {
      compare = b.dataset.mxCompare.split(",").map(Number).slice(0, 4);
      setTab("players");
      updateUrl();
      document
        .querySelector("#mxComparison")
        ?.scrollIntoView({ block: "start" });
    } else if (b.hasAttribute("data-mx-watch")) {
      if (!prefsReady) {
        await preferences();
        if (!prefsReady) {
          showToast("Watchlist unavailable. Please retry shortly.");
          return;
        }
      }
      const id = Number(b.dataset.mxWatch),
        list = prefs.watched_players.includes(id)
          ? prefs.watched_players.filter((x) => x !== id)
          : [...prefs.watched_players, id];
      if (list.length > 100) {
        showToast("Your watchlist is full. Remove a player first.");
        return;
      }
      await savePreferences({ watched_players: list });
    } else if (b.hasAttribute("data-mx-clear")) {
      compare = [];
      setTab("players");
      updateUrl();
    } else if (b.hasAttribute("data-mx-share")) await share();
    else if (b.hasAttribute("data-mx-watchlist")) {
      filters.watch = true;
      setTab("players");
      updateUrl();
    } else if (b.hasAttribute("data-mx-waivers")) {
      filters.position = b.dataset.mxPosition || "";
      setTab("faab");
    } else if (b.hasAttribute("data-mx-stream")) {
      filters.position = b.dataset.mxStream;
      setTab("faab");
    } else if (b.hasAttribute("data-mx-reset")) {
      filters = {
        search: "",
        position: "",
        owner: "",
        health: "",
        bye: "",
        sort: "proj",
        watch: false,
      };
      setTab("players");
      updateUrl();
    } else if (b.hasAttribute("data-mx-favorite")) {
      if (!prefsReady) {
        await preferences();
        if (!prefsReady) {
          showToast("Shortcuts unavailable. Please retry shortly.");
          return;
        }
      }
      const id = api.getCurrent(),
        list = prefs.favorite_pages.includes(id)
          ? prefs.favorite_pages.filter((x) => x !== id)
          : [...prefs.favorite_pages, id];
      if (list.length > 6)
        showToast("Save up to six shortcuts. Remove one first.");
      else await savePreferences({ favorite_pages: list });
    } else if (b.hasAttribute("data-mx-export-players"))
      download(
        [
          [
            "Player",
            "Position",
            "NFL team",
            "Fantasy team / status",
            "Projection",
            "Season avg",
            "Last 3",
            "Recorded games",
          ],
          ...filteredPlayers().map((p) => [
            p.name,
            p.pos,
            p.pro,
            ownership(p),
            p.proj,
            p.avg,
            p.l3,
            p.games,
          ]),
        ],
        "mfl-players.csv",
      );
    else if (b.hasAttribute("data-mx-export")) {
      const rows = [];
      document.querySelectorAll("#app table").forEach((t) => {
        rows.push(
          [],
          ...[...t.rows].map((row) =>
            [...row.cells].map((c) => c.textContent.trim()),
          ),
        );
      });
      download(rows, "mfl-" + api.getCurrent() + ".csv");
    }
  });
  // Give every modal a name, focus management, and a keyboard-contained interaction.
  let activeModal = null,
    returnFocus = null;
  const observer = new MutationObserver(() => {
    const modal = document.getElementById("mdl");
    if (modal === activeModal) return;
    if (!modal) {
      activeModal = null;
      document.querySelector(".shell")?.removeAttribute("inert");
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      return;
    }
    returnFocus = activeModal ? returnFocus : document.activeElement;
    activeModal = modal;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    if (
      !modal.hasAttribute("aria-label") &&
      !modal.hasAttribute("aria-labelledby")
    )
      modal.setAttribute(
        "aria-label",
        modal.querySelector("h2,h3,.eyebrow")?.textContent || "League panel",
      );
    const controls = () =>
      [
        ...modal.querySelectorAll(
          'button,a[href],input,select,textarea,summary,[tabindex="0"]',
        ),
      ].filter((n) => !n.disabled && !n.hidden && n.getClientRects().length);
    modal.tabIndex = -1;
    (controls()[0] || modal).focus({ preventScroll: true });
    modal.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const c = controls();
      if (!c.length) {
        e.preventDefault();
        modal.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === c[0]) {
        e.preventDefault();
        c.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === c.at(-1)) {
        e.preventDefault();
        c[0].focus();
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Complete the existing notification panel with per-browser controls.
  const notifyObserver = new MutationObserver(() => {
    const modal = document.getElementById("mdl");
    if (!modal?.querySelector("#npOn") || modal.querySelector("#mxAlertPrefs"))
      return;
    const panel = document.createElement("section");
    panel.id = "mxAlertPrefs";
    panel.className = "card card-p";
    panel.innerHTML = `<h3>Choose your alerts</h3><p class="metricnote">Saved for this browser. Quiet hours use this device's current time-zone offset; reopen settings after travel or a clock change.</p>${["league", "matchup", "trade"].map((c) => `<label class="mx-check"><input type="checkbox" value="${c}" ${prefs.alert_categories.includes(c) ? "checked" : ""}> ${c === "league" ? "League announcements" : c === "matchup" ? "Matchup updates" : "Trade updates"}</label>`).join("")}<label>Quiet hours <select id="mxQuiet"><option value="off">Off</option><option value="on" ${prefs.quiet_start != null ? "selected" : ""}>On</option></select></label><div class="mx-actions"><label>From <select id="mxQuietStart">${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${(prefs.quiet_start ?? 22) === i ? "selected" : ""}>${String(i).padStart(2, "0")}:00</option>`).join("")}</select></label><label>Until <select id="mxQuietEnd">${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${(prefs.quiet_end ?? 8) === i ? "selected" : ""}>${String(i).padStart(2, "0")}:00</option>`).join("")}</select></label></div><div class="mx-actions">${button("Save alerts", 'id="mxSaveAlerts"', "")}${button("Test notification", 'id="mxTestAlert"')}</div><p id="mxAlertStatus" role="status"></p>`;
    modal.querySelector(".mdl-box").appendChild(panel);
    modal.querySelector("#npOn").addEventListener("click", () => {
      setTimeout(() => {
        if (prefsReady) void savePreferences({});
      }, 2500);
    });
    if (!prefs.delivery_controls) {
      panel.querySelector("#mxSaveAlerts").disabled = true;
      panel.querySelector("#mxAlertStatus").textContent =
        "Alert delivery preferences are temporarily unavailable. You can still test notifications.";
    }
    panel.querySelector("#mxSaveAlerts").onclick = async () => {
      const active = panel.querySelector("#mxQuiet").value === "on",
        start = Number(panel.querySelector("#mxQuietStart").value),
        end = Number(panel.querySelector("#mxQuietEnd").value);
      if (active && start === end) {
        panel.querySelector("#mxAlertStatus").textContent =
          "Choose different start and end hours.";
        return;
      }
      await savePreferences({
        alert_categories: [...panel.querySelectorAll("input:checked")].map(
          (n) => n.value,
        ),
        quiet_start: active ? start : null,
        quiet_end: active ? end : null,
      });
    };
    panel.querySelector("#mxTestAlert").onclick = async () => {
      const status = panel.querySelector("#mxAlertStatus");
      try {
        if (
          !("Notification" in window) ||
          Notification.permission !== "granted"
        )
          throw new Error("Enable notifications first.");
        const sw = await navigator.serviceWorker.ready;
        await sw.showNotification("MFL is ready", {
          body: "Notifications can appear on this device.",
          icon: "/icon-192.png",
          tag: "mfl-test",
          data: { url: "/" },
        });
        status.textContent =
          "Test displayed. This checks device permission; remote push delivery is separate.";
      } catch (e) {
        status.textContent = e.message || "Could not show a test notification.";
      }
    };
  });
  notifyObserver.observe(document.body, { childList: true, subtree: true });
  let previousLocks = "";
  setInterval(() => {
    if (document.hidden || document.getElementById("mdl")) return;
    if (
      ["dash", "players", "myteam", "faab", "trade"].includes(api.getCurrent())
    )
      void ensureResearch();
    updateFreshness();
    const id = me();
    if (id == null) return;
    const lockKey =
      id +
      ":" +
      rosterPlayers(id)
        .map((p) => p.id + ":" + p.locked)
        .join(",");
    if (
      previousLocks &&
      previousLocks !== lockKey &&
      api.getCurrent() === "myteam" &&
      !document.querySelector("#app input:focus,#app select:focus")
    ) {
      const panel = document.querySelector("#app .mx-lineup");
      if (panel) panel.outerHTML = lineup(id);
    }
    previousLocks = lockKey;
  }, 30000);
  return {
    lineup,
    enhanceView,
    updateFreshness,
    route,
    updateUrl,
    ensureResearch,
    preferences,
    rosterPlayers,
    slots,
    allPlayers,
    openResearchPlayer,
    tradePartners,
  };
}
