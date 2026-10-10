(function () {
  const E = window.ClueEngine;
  const STORAGE_KEY = "clue-sheet-v1";
  const root = document.getElementById("app");
  const timers = { toast: 0, flash: 0 };
  let scrollTop = 0;

  const state = loadState() || freshState();

  function freshState() {
    return {
      screen: "setup",
      setup: {
        step: "players",
        players: [
          { id: "p1", name: "Me" },
          { id: "p2", name: "" },
          { id: "p3", name: "" },
          { id: "p4", name: "" },
        ],
        youId: "p1",
        yourHand: [],
        publicCards: [],
        error: "",
      },
      game: null,
      wizard: null,
      detailId: null,
      modal: null,
      toast: null,
      flash: [],
      historyOpen: false,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.setup || !Array.isArray(data.setup.players)) return null;
      if (data.game && !Array.isArray(data.game.suggestions)) return null;
      return {
        screen: data.screen === "play" && data.game ? "play" : "setup",
        setup: {
          step: data.setup.step || "players",
          players: data.setup.players.map((player) => {
            const youId = data.setup.youId || data.setup.players[0].id;
            if (player.id === youId && !String(player.name || "").trim()) {
              return { ...player, name: "Me" };
            }
            return player;
          }),
          youId: data.setup.youId || data.setup.players[0].id,
          yourHand: data.setup.yourHand || [],
          publicCards: data.setup.publicCards || [],
          error: "",
        },
        game: data.game || null,
        wizard: null,
        detailId: null,
        modal: null,
        toast: null,
        flash: [],
        historyOpen: false,
      };
    } catch (error) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          screen: state.screen,
          setup: state.setup,
          game: state.game,
        })
      );
    } catch (error) {
      /* Private mode can block storage; the sheet still works for this visit. */
    }
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message) {
    state.toast = message;
    window.clearTimeout(timers.toast);
    timers.toast = window.setTimeout(() => {
      state.toast = null;
      render();
    }, 4600);
  }

  function flashCards(ids) {
    state.flash = ids;
    window.clearTimeout(timers.flash);
    if (!ids.length) return;
    timers.flash = window.setTimeout(() => {
      state.flash = [];
      render();
    }, 1700);
  }

  function render() {
    const scroller = document.querySelector(".sheet-scroll");
    if (scroller) scrollTop = scroller.scrollTop;
    root.innerHTML = state.screen === "play" ? renderPlay() : renderSetup();
    root.insertAdjacentHTML("beforeend", renderModal() + renderToast());
    const next = document.querySelector(".sheet-scroll");
    if (next) next.scrollTop = scrollTop;
  }

  function renderToast() {
    if (!state.toast) return "";
    return `<div class="toast" role="status">${esc(state.toast)}</div>`;
  }

  function renderModal() {
    if (!state.modal) return "";
    return `
      <div class="scrim is-modal">
        <div class="dialog" data-action="stop">
          <h2>${esc(state.modal.title)}</h2>
          <p>${esc(state.modal.body)}</p>
          <div class="dialog-actions">
            <button type="button" class="secondary" data-action="confirm-no">Keep it</button>
            <button type="button" class="primary" data-action="confirm-yes">${esc(state.modal.confirm)}</button>
          </div>
        </div>
      </div>`;
  }

  function renderSetup() {
    const step = state.setup.step;
    const label = step === "players" ? "Seats" : step === "hand" ? "Your cards" : "Shared cards";
    const index = step === "players" ? 1 : step === "hand" ? 2 : 3;
    return `
      <div class="screen">
        <header class="topbar">
          <div class="title-row">
            ${
              step === "players"
                ? "<span></span>"
                : '<button type="button" class="text-btn" data-action="setup-back">Back</button>'
            }
            <p class="step-label">Step ${index} of 3 · ${label}</p>
            <span></span>
          </div>
          <h1>Clue Sheet</h1>
          <p class="lede">${
            step === "players"
              ? "Sit the table clockwise. Answers start with the player on the asker's left."
              : step === "hand"
                ? "Tap every card you were dealt. Those rows get an × in every column."
                : "Tap cards everyone saw before the deal. Skip this if the cards came out even."
          }</p>
        </header>
        <main class="setup-main">
          ${step === "players" ? renderSeats() : renderCardPicker(step)}
          ${state.setup.error ? `<p class="error">${esc(state.setup.error)}</p>` : ""}
        </main>
        <footer class="bar">
          <button type="button" class="primary" data-action="${step === "public" ? "start-game" : "setup-next"}">
            ${step === "public" ? "Start the sheet" : "Next"}
          </button>
          ${
            step === "players"
              ? '<button type="button" class="ghost" data-action="load-example">Try the 4-player walkthrough</button>'
              : ""
          }
        </footer>
      </div>`;
  }

  function renderSeats() {
    const players = state.setup.players;
    const deal = E.dealExpectation(players.length);
    const leftover =
      deal.publicCards === 0
        ? `${players.length} players usually hold ${deal.handSize} cards each.`
        : `${players.length} players usually hold ${deal.handSize}, after ${deal.publicCards} leftover cards are shown.`;
    return `
      <div class="stack">
        ${players
          .map((player, index) => {
            const mine = player.id === state.setup.youId;
            return `
              <div class="seat">
                <button type="button" class="me-btn${mine ? " is-on" : ""}" data-action="set-you" data-id="${esc(player.id)}" aria-pressed="${mine}">Me</button>
                <input data-name="${esc(player.id)}" value="${esc(player.name)}" placeholder="${mine ? "Your name" : "Player " + (index + 1)}" maxlength="18" autocapitalize="words" autocomplete="off" enterkeyhint="done" />
                <button type="button" class="icon-btn" data-action="move-player" data-id="${esc(player.id)}" data-dir="up" aria-label="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="icon-btn" data-action="move-player" data-id="${esc(player.id)}" data-dir="down" aria-label="Move down" ${index === players.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" class="icon-btn" data-action="remove-player" data-id="${esc(player.id)}" aria-label="Remove seat" ${players.length <= 2 ? "disabled" : ""}>×</button>
              </div>`;
          })
          .join("")}
      </div>
      ${
        players.length < 6
          ? '<button type="button" class="ghost" data-action="add-player">Add a seat</button>'
          : ""
      }
      <p class="deal-note">${esc(leftover)} List the seats in clockwise order.</p>`;
  }

  function renderCardPicker(step) {
    const selected = step === "hand" ? state.setup.yourHand : state.setup.publicCards;
    const mine = new Set(state.setup.yourHand);
    const players = state.setup.players.length;
    const expected = E.dealExpectation(players);
    const balance = balanceCopy(players, state.setup.yourHand.length, state.setup.publicCards.length);
    return `
      <p class="count-banner">${selected.length} selected</p>
      <p class="deal-note ${balance.ok ? "is-ok" : "is-off"}">${esc(
        step === "hand"
          ? `A standard hand for this table is ${expected.handSize}.`
          : balance.text
      )}</p>
      ${E.CATEGORIES.map(
        (category) => `
          <h2 class="group">${esc(category.label)}</h2>
          <div class="chips">
            ${category.cards
              .map((card) => {
                const locked = step === "public" && mine.has(card.id);
                const on = selected.includes(card.id);
                return `<button type="button" class="chip${on ? " is-on" : ""}${locked ? " is-locked" : ""}" data-action="toggle-card" data-card="${card.id}" ${locked ? "disabled" : ""} aria-pressed="${on}">
                  ${esc(card.name)}${locked ? "<small>Yours</small>" : ""}
                </button>`;
              })
              .join("")}
          </div>`
      ).join("")}`;
  }

  function balanceCopy(playerCount, hand, shared) {
    const expected = E.dealExpectation(playerCount);
    const ok = hand * playerCount + shared === E.OUTSIDE_ENVELOPE;
    if (ok && hand === expected.handSize && shared === expected.publicCards) {
      return {
        ok: true,
        text: "Counts match a standard deal. Even hands let a full column cross out the rest.",
      };
    }
    if (ok) {
      return { ok: true, text: "These counts cover all 18 cards outside the envelope." };
    }
    return {
      ok: false,
      text: `18 cards sit outside the envelope. This sheet has ${hand} in your hand and ${shared} shared, so it can't be an even deal yet. Passes and numbers still work.`,
    };
  }

  function renderPlay() {
    const game = state.game;
    const analysis = E.analyze(game);
    const chances = E.holdChances(game, analysis);
    const status = E.envelopeStatus(analysis);
    const canUndo = game.suggestions.length > 0;
    const guessCount = game.suggestions.length;
    return `
      <div class="screen play">
        <header class="topbar play-top">
          ${renderSolution(status)}
          <div class="header-actions">
            ${
              guessCount
                ? `<button type="button" class="text-btn" data-action="show-history" aria-label="${guessCount} guesses">Guesses</button>`
                : ""
            }
            <button type="button" class="text-btn" data-action="undo" ${canUndo ? "" : "disabled"}>Undo</button>
            <button type="button" class="text-btn" data-action="new-game">New</button>
          </div>
        </header>
        <main class="sheet-scroll">
          <div class="paper${state.wizard ? " is-logging" : ""}">
            ${renderGrid(game, analysis, chances)}
          </div>
        </main>
        <footer class="bar">
          ${renderDock(game, analysis)}
        </footer>
      </div>
      ${renderDetail(game, analysis, chances)}
      ${renderHistoryPanel(game)}`;
  }

  function renderSolution(status) {
    const cards = [
      ["suspects", "Who"],
      ["weapons", "Weapon"],
      ["rooms", "Where"],
    ];
    const banner = status.solved
      ? `<div class="accuse"><span>Ready to accuse</span><strong>${esc(envelopePhrase(status))}</strong></div>`
      : "";
    return `
      ${banner}
      <div class="solution">
        ${cards
          .map(([id, label]) => {
            const item = status.byCategory[id];
            const known = item.known;
            const jump = known ? known.id : item.remaining[0] ? item.remaining[0].id : "";
            const sub = known
              ? "In the envelope"
              : item.remaining.length > 3
                ? "Still open"
                : item.remaining.length
                  ? item.remaining.map((card) => card.short).join(" · ")
                  : "No card left";
            return `
              <button type="button" class="sol-card${known ? " is-known" : ""}" data-action="jump" data-card="${jump}">
                <span class="sol-kicker">${label}</span>
                <span class="sol-value">${esc(known ? known.short : item.remaining.length + " left")}</span>
                <span class="sol-sub">${esc(sub)}</span>
              </button>`;
          })
          .join("")}
      </div>`;
  }

  function sheetPlayers(game) {
    const you = game.players.find((player) => player.isYou);
    const others = game.players.filter((player) => !player.isYou);
    return you ? [you, ...others] : game.players;
  }

  function renderGrid(game, analysis, chances) {
    const colors = ["#8f2d2d", "#a6843d", "#2f6f4e", "#2c5f8a", "#6d3d78", "#8a5a3c"];
    const players = sheetPlayers(game);
    const head = players
      .map((player, index) => {
        return `<th class="player${player.isYou ? " is-you" : ""}" style="--player:${colors[index % colors.length]}" aria-label="${esc(player.name + (player.isYou ? ", you" : ""))}"><span class="col-name">${esc(player.name)}</span></th>`;
      })
      .join("");
    const body = E.CATEGORIES.map((category) => {
      const label = `<tr class="cat-row"><th class="name-cell">${esc(category.label)}</th>${players
        .map((player) => `<th${player.isYou ? ' class="is-you"' : ""}></th>`)
        .join("")}</tr>`;
      const rows = category.cards
        .map((card) => {
          const owner = analysis.owners[card.id];
          const tag = rowTag(owner, chances, game, card.id);
          const classes = ["card-row"];
          if (owner?.kind === "you") classes.push("is-yours");
          if (owner?.kind === "public") classes.push("is-shared");
          if (owner?.kind === "envelope") classes.push("is-envelope");
          if (owner?.kind === "player") classes.push("is-held");
          if (state.flash.includes(card.id)) classes.push("is-flash");
          const rowAction = state.wizard ? "pick-row" : "detail";
          if (state.wizard) classes.push(...rowLogClasses(card.id));
          const cells = players
            .map((player) => {
              const cell = player.isYou
                ? youCellMark(game, card.id)
                : cellMark(analysis, player.id, card.id, chances[player.id][card.id]);
              return `<td class="mark ${cell.className}${player.isYou ? " is-you" : ""}" aria-label="${esc(player.name + " " + cell.label)}">${cell.html}</td>`;
            })
            .join("");
          return `<tr id="row-${card.id}" class="${classes.join(" ")}" data-action="${rowAction}" data-card="${card.id}">
            <th class="name-cell" scope="row"><button type="button" class="row-hit" data-action="${rowAction}" data-card="${card.id}"><span class="card-name">${esc(card.short)}</span>${
              tag ? `<span class="card-tag" title="${esc(tag.title)}">${esc(tag.text)}</span>` : ""
            }</button></th>
            ${cells}
          </tr>`;
        })
        .join("");
      return label + rows;
    }).join("");
    return `<table class="grid">
      <thead><tr><th class="name-cell">Card</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function ownerTag(owner, game) {
    if (!owner) return "";
    if (owner.kind === "you") return "Yours";
    if (owner.kind === "public") return "Shared";
    if (owner.kind === "envelope") return "Envelope";
    const player = game.players.find((item) => item.id === owner.playerId);
    return player ? player.name : "";
  }

  function youCellMark(game, cardId) {
    if (game.yourHand.includes(cardId)) {
      return {
        className: "is-has",
        html: `<div class="box is-center"><span class="check-mark">✓</span></div>`,
        label: "has this card",
      };
    }
    return { className: "is-out", html: `<div class="box is-center">×</div>`, label: "does not have this card" };
  }

  function cellMark(analysis, playerId, cardId, chance) {
    const owner = analysis.owners[cardId];
    if (owner?.kind === "player" && owner.playerId === playerId) {
      const nums = analysis.marks[playerId]?.[cardId] || [];
      const numbers = cornerNums(nums);
      return {
        className: "is-has",
        html: `<div class="box is-center${nums.length ? " has-nums" : ""}"><span class="check-mark">✓</span>${numbers}</div>`,
        label: nums.length ? "has this card, guesses " + nums.join(" and ") : "has this card",
      };
    }
    if (analysis.eliminated[playerId]?.[cardId]) {
      return { className: "is-out", html: `<div class="box is-center">×</div>`, label: "does not have this card" };
    }
    const nums = analysis.marks[playerId]?.[cardId] || [];
    const numbers = cornerNums(nums);
    const pct = formatChance(chance);
    return {
      className: nums.length ? "is-maybe" : "is-empty",
      html: `<div class="box has-chance${numbers ? " has-nums" : ""}"><span class="chance">${pct}</span>${numbers}</div>`,
      label: nums.length ? `${pct} chance, guesses ${nums.join(" and ")}` : `${pct} chance`,
    };
  }

  function formatChance(value, decimals) {
    const p = Number(value);
    if (!Number.isFinite(p) || p <= 1e-9) return "0%";
    if (p >= 1 - 1e-9) return "100%";
    const pct = p * 100;
    if (decimals) {
      if (pct < 0.05) return "<0.1%";
      return `${pct.toFixed(1)}%`;
    }
    if (pct < 0.5) return "<1%";
    if (pct > 99.5) return ">99%";
    return `${Math.round(pct)}%`;
  }

  function envelopeChance(chances, game, cardId) {
    if (game.yourHand.includes(cardId) || game.publicCards.includes(cardId)) return 0;
    let held = 0;
    game.players.forEach((player) => {
      if (player.isYou) return;
      held += chances[player.id]?.[cardId] || 0;
    });
    const left = 1 - held;
    if (left <= 1e-9) return 0;
    if (left >= 1) return 1;
    return left;
  }

  function rowTag(owner, chances, game, cardId) {
    const owned = ownerTag(owner, game);
    if (owned === "Envelope") return { text: "Env", title: "In the envelope" };
    if (owned) return { text: owned, title: owned };
    const value = envelopeChance(chances, game, cardId);
    if (value <= 0.0005 || value >= 0.9995) return null;
    const pct = formatChance(value);
    return { text: pct, title: `${pct} envelope` };
  }

  function cornerNums(nums) {
    if (!nums.length) return "";
    return `<span class="corner-nums">${nums.map((num) => `<span class="corner-num">${num}</span>`).join("")}</span>`;
  }

  function rowLogClasses(cardId) {
    const wizard = state.wizard;
    if (!wizard) return [];
    const selected = [wizard.suspectId, wizard.weaponId, wizard.roomId];
    if (wizard.pendingId && selected.includes(cardId)) return ["is-asked"];
    if (selected.includes(cardId)) return ["is-picked"];
    return [];
  }

  function renderHistoryPanel(game) {
    if (!state.historyOpen) return "";
    const items = game.suggestions
      .map((suggestion, index) => {
        const asker = game.players.find((player) => player.id === suggestion.suggesterId);
        const phrase = `${E.CARD_MAP[suggestion.suspectId].name} with the ${E.CARD_MAP[suggestion.weaponId].name} in the ${E.CARD_MAP[suggestion.roomId].name}`;
        const answers = suggestion.responses
          .map((response) => {
            const player = game.players.find((item) => item.id === response.playerId);
            const name = player.isYou ? "You" : player.name;
            if (response.type === "pass") return `${name} passed`;
            if (response.cardId) return `${name} showed you ${E.cardPhrase(E.CARD_MAP[response.cardId])}`;
            if (player.isYou) return "You showed a card";
            return `${name} showed a card`;
          })
          .join(". ");
        return `<li class="guess">
          <span class="guess-num">${index + 1}</span>
          <div>
            <div class="guess-who">${esc(asker.name)} asked</div>
            <div class="guess-cards">${esc(phrase)}</div>
            <div class="guess-result">${esc(answers)}.</div>
          </div>
        </li>`;
      })
      .join("");
    const body = items
      ? `<ol class="guess-list">${items}</ol>`
      : `<p class="reason">Logged guesses show up here so a number on the sheet points back at the ask.</p>`;
    return `
      <div class="scrim" data-action="close-history">
        <section class="panel" data-action="stop">
          <div class="panel-bar">
            <h2>Guesses</h2>
            <button type="button" class="text-btn" data-action="close-history" style="color:#241c14">Close</button>
          </div>
          ${body}
        </section>
      </div>`;
  }

  function renderDetail(game, analysis, chances) {
    if (!state.detailId || !E.CARD_MAP[state.detailId]) return "";
    const card = E.CARD_MAP[state.detailId];
    const owner = analysis.owners[card.id];
    const headline = owner ? ownerHeadline(owner, game) : "Still unknown";
    const reason = owner ? owner.reason : "It can still be in a hand, or it can be the envelope.";
    const envP = owner ? 0 : envelopeChance(chances, game, card.id);
    const envNote =
      !owner && envP > 0.0005 && envP < 0.9995 ? ` ${formatChance(envP, true)} chance it is in the envelope.` : "";
    const rows = game.players
      .map((player) => {
        const pct = formatChance(chances[player.id][card.id], true);
        if (player.isYou) {
          const note = game.yourHand.includes(card.id) ? "In your hand." : "Not in your hand.";
          return `<li><strong>${esc(player.name)}</strong><span>${esc(`${pct}. ${note}`)}</span></li>`;
        }
        const mark = cellMark(analysis, player.id, card.id, chances[player.id][card.id]);
        let note = "No mark yet.";
        if (mark.className === "is-has") {
          note = owner?.playerId === player.id ? owner.reason : "Has it.";
          const nums = analysis.marks[player.id]?.[card.id];
          if (nums?.length) note += ` Guess ${nums.join(" and ")} stayed in the box.`;
        }
        else if (analysis.eliminated[player.id]?.[card.id]) note = analysis.eliminated[player.id][card.id];
        else if (analysis.marks[player.id]?.[card.id]) {
          note = `Still possible from guess ${analysis.marks[player.id][card.id].join(" and ")}.`;
        }
        return `<li><strong>${esc(player.name)}</strong><span>${esc(`${pct}. ${note}`)}</span></li>`;
      })
      .join("");
    return `
      <div class="scrim" data-action="close-detail">
        <section class="panel" data-action="stop">
          <div class="panel-bar">
            <h2>${esc(card.name)}</h2>
            <button type="button" class="text-btn" data-action="close-detail" style="color:#241c14">Close</button>
          </div>
          <p class="reason"><strong>${esc(headline)}.</strong> ${esc(reason)}${esc(envNote)}</p>
          <ul class="detail-list">${rows}</ul>
        </section>
      </div>`;
  }

  function ownerHeadline(owner, game) {
    if (owner.kind === "you") return "In your hand";
    if (owner.kind === "public") return "Shared with the table";
    if (owner.kind === "envelope") return "In the envelope";
    return `${playerById(game, owner.playerId).name} has this`;
  }

  function renderDock(game, analysis) {
    const next = game.suggestions.length + 1;
    if (!state.wizard) {
      const ask = E.recommendAsk(game, analysis);
      if (!ask) return `<button type="button" class="primary bar-log" data-action="log-guess">Log guess ${next}</button>`;
      return renderAsk(ask);
    }
    const wizard = state.wizard;
    const cardsReady = Boolean(wizard.suspectId && wizard.weaponId && wizard.roomId);
    const asker = wizard.suggesterId ? playerById(game, wizard.suggesterId) : null;
    const pickingCards = !wizard.pendingId && !(cardsReady && asker);
    const askers = game.players
      .map((player) => {
        const on = player.id === wizard.suggesterId;
        return `<button type="button" class="chip${on ? " is-on" : ""}" data-action="pick-suggester" data-id="${esc(player.id)}" aria-pressed="${on}">${esc(player.name)}</button>`;
      })
      .join("");
    return `
      <div class="dock">
        <div class="dock-head">
          <span class="entry-num">${next}</span>
          <span class="dock-title">${esc(dockTitle(game, asker, cardsReady))}</span>
          <button type="button" class="text-btn" data-action="wizard-back">Back</button>
        </div>
        ${wizard.pendingId ? "" : renderSlots(wizard)}
        ${pickingCards ? `<div class="dock-row">${askers}</div>` : renderShowerRow(game, analysis)}
      </div>`;
  }

  function renderSlots(wizard) {
    const slots = [
      [wizard.suspectId, "Suspect"],
      [wizard.weaponId, "Weapon"],
      [wizard.roomId, "Room"],
    ];
    return `<p class="dock-slots">${slots
      .map(([id, fallback]) => `<span class="${id ? "is-set" : "is-empty"}">${esc(cardShort(id, fallback))}</span>`)
      .join('<span class="ask-dot" aria-hidden="true">·</span>')}</p>`;
  }

  function renderAsk(ask) {
    const names = [ask.suspectId, ask.weaponId, ask.roomId]
      .map((id) => {
        const focus = id === ask.focusId ? " is-focus" : "";
        return `<span class="ask-name${focus}">${esc(E.CARD_MAP[id].short)}</span>`;
      })
      .join('<span class="ask-dot" aria-hidden="true">·</span>');
    const label = [ask.suspectId, ask.weaponId, ask.roomId].map((id) => E.CARD_MAP[id].short).join(", ");
    return `
      <div class="ask-bar">
        <button type="button" class="ask-main" data-action="ask-this" data-suspect="${esc(ask.suspectId)}" data-weapon="${esc(ask.weaponId)}" data-room="${esc(ask.roomId)}" data-focus="${esc(ask.focusId)}" aria-label="${esc(`Ask ${label}. ${ask.reason}`)}">
          <span class="ask-line">
            <span class="ask-kicker">Ask</span>
            <span class="ask-cards">${names}</span>
          </span>
          <span class="ask-reason">${esc(ask.reason)}</span>
        </button>
        <button type="button" class="text-btn ask-log" data-action="log-guess" aria-label="Log a different guess">Log</button>
      </div>`;
  }

  function dockTitle(game, asker, cardsReady) {
    const wizard = state.wizard;
    if (wizard.pendingId) return `Which card did ${playerById(game, wizard.pendingId).name} show?`;
    if (asker && cardsReady) return "Who showed a card?";
    if (!asker) return "Who asked?";
    return `${asker.name} asked`;
  }

  function cardShort(cardId, fallback) {
    return cardId ? E.CARD_MAP[cardId].short : fallback;
  }

  function renderShowerRow(game, analysis) {
    const wizard = state.wizard;
    const cards = [wizard.suspectId, wizard.weaponId, wizard.roomId];
    if (wizard.pendingId) {
      const could = new Set(E.cardsPlayerCouldShow(analysis, game, wizard.pendingId, cards));
      return `
        <div class="dock-row">
          ${cards
            .map((cardId) => {
              const open = could.has(cardId);
              return `<button type="button" class="chip${open ? "" : " is-locked"}" data-action="pick-shown" data-card="${cardId}" ${
                open ? "" : "disabled"
              }>${esc(E.CARD_MAP[cardId].name)}</button>`;
            })
            .join("")}
        </div>
        <p class="dock-note">Or tap that row on the sheet.</p>`;
    }
    const order = E.responseOrder(game.players, wizard.suggesterId);
    const youIndex = order.findIndex((player) => player.isYou);
    const youCould =
      youIndex >= 0 ? E.cardsPlayerCouldShow(analysis, game, order[youIndex].id, cards) : [];
    const choices = order
      .map((player, index) => {
        const could = E.cardsPlayerCouldShow(analysis, game, player.id, cards);
        const blocked = could.length === 0 || (youCould.length > 0 && index > youIndex);
        const label = player.isYou ? "I showed" : player.name;
        return `<button type="button" class="chip" data-action="pick-shower" data-id="${esc(player.id)}" ${
          blocked ? "disabled" : ""
        }>${esc(label)}</button>`;
      })
      .join("");
    const allBlocked = youCould.length > 0;
    return `
      <div class="dock-row">
        ${choices}
        <button type="button" class="chip" data-action="all-passed" ${allBlocked ? "disabled" : ""}>All passed</button>
      </div>
      <p class="dock-note">${esc(
        youCould.length
          ? `You hold ${youCould.map((id) => E.CARD_MAP[id].name).join(" and ")}. Someone up to you has to show.`
          : "Everyone before the person who showed is marked as a pass."
      )}</p>`;
  }

  function playerById(game, id) {
    return game.players.find((player) => player.id === id);
  }

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);

  function onInput(event) {
    const input = event.target.closest("[data-name]");
    if (!input) return;
    const player = state.setup.players.find((item) => item.id === input.dataset.name);
    if (!player) return;
    player.name = input.value;
    save();
  }

  function onClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (action === "stop") return;

    if (action === "setup-next") return nextSetup();
    if (action === "setup-back") {
      state.setup.error = "";
      state.setup.step = state.setup.step === "public" ? "hand" : "players";
      save();
      render();
      return;
    }
    if (action === "set-you") {
      state.setup.youId = target.dataset.id;
      save();
      render();
      return;
    }
    if (action === "add-player") return addPlayer();
    if (action === "remove-player") return removePlayer(target.dataset.id);
    if (action === "move-player") return movePlayer(target.dataset.id, target.dataset.dir);
    if (action === "toggle-card") return toggleCard(target.dataset.card);
    if (action === "start-game") return startGame();
    if (action === "load-example") return loadExample();
    if (action === "log-guess") {
      state.detailId = null;
      state.historyOpen = false;
      state.wizard = blankWizard();
      render();
      return;
    }
    if (action === "ask-this") {
      const you = state.game.players.find((player) => player.isYou);
      state.detailId = null;
      state.historyOpen = false;
      state.wizard = {
        step: "log",
        suggesterId: you.id,
        suspectId: target.dataset.suspect,
        weaponId: target.dataset.weapon,
        roomId: target.dataset.room,
        responses: [],
        pendingId: null,
      };
      render();
      const row = document.getElementById("row-" + target.dataset.focus);
      if (row) row.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (action === "show-history") {
      state.detailId = null;
      state.historyOpen = true;
      render();
      return;
    }
    if (action === "close-history") {
      state.historyOpen = false;
      render();
      return;
    }
    if (action === "undo") return undo();
    if (action === "new-game") return askNewGame();
    if (action === "confirm-no") {
      state.modal = null;
      render();
      return;
    }
    if (action === "confirm-yes") return confirmModal();
    if (action === "detail") {
      state.historyOpen = false;
      state.detailId = target.dataset.card;
      render();
      return;
    }
    if (action === "pick-row") return pickRow(target.dataset.card);
    if (action === "close-detail") {
      state.detailId = null;
      render();
      return;
    }
    if (action === "jump") {
      if (!target.dataset.card) return;
      state.detailId = null;
      render();
      const row = document.getElementById("row-" + target.dataset.card);
      if (row) row.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (action === "wizard-back") return wizardBack();
    if (action === "pick-suggester") {
      state.wizard.suggesterId = target.dataset.id;
      state.wizard.pendingId = null;
      state.wizard.responses = [];
      render();
      return;
    }
    if (action === "pick-guess") return pickGuess(target.dataset.category, target.dataset.card);
    if (action === "pick-shower") return chooseShower(target.dataset.id);
    if (action === "all-passed") return chooseShower("all");
    if (action === "pick-shown") return commitShow(target.dataset.card);
  }

  function blankWizard() {
    return {
      step: "log",
      suggesterId: null,
      suspectId: null,
      weaponId: null,
      roomId: null,
      responses: [],
      pendingId: null,
    };
  }

  function nextSetup() {
    const names = state.setup.players.map((player) => player.name.trim());
    if (names.some((name) => !name)) {
      state.setup.error = "Add a name for every seat.";
      render();
      return;
    }
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
      state.setup.error = "Use a different name for each seat.";
      render();
      return;
    }
    state.setup.players.forEach((player, index) => {
      player.name = names[index];
    });
    state.setup.error = "";
    state.setup.step = state.setup.step === "players" ? "hand" : "public";
    scrollTop = 0;
    save();
    render();
  }

  function addPlayer() {
    if (state.setup.players.length >= 6) return;
    let number = state.setup.players.length + 1;
    let id = "p" + number;
    while (state.setup.players.some((player) => player.id === id)) {
      number += 1;
      id = "p" + number;
    }
    state.setup.players.push({ id, name: "" });
    save();
    render();
  }

  function removePlayer(id) {
    if (state.setup.players.length <= 2) return;
    state.setup.players = state.setup.players.filter((player) => player.id !== id);
    if (state.setup.youId === id) state.setup.youId = state.setup.players[0].id;
    save();
    render();
  }

  function movePlayer(id, direction) {
    const list = state.setup.players;
    const index = list.findIndex((player) => player.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
    save();
    render();
  }

  function toggleCard(cardId) {
    const list = state.setup.step === "hand" ? state.setup.yourHand : state.setup.publicCards;
    if (state.setup.step === "public" && state.setup.yourHand.includes(cardId)) return;
    const index = list.indexOf(cardId);
    if (index >= 0) list.splice(index, 1);
    else list.push(cardId);
    if (state.setup.step === "hand") {
      state.setup.publicCards = state.setup.publicCards.filter((id) => id !== cardId);
    }
    state.setup.error = "";
    save();
    render();
  }

  function startGame() {
    if (!state.setup.yourHand.length) {
      state.setup.error = "Mark the cards in your hand before you start.";
      render();
      return;
    }
    const created = E.createGame({
      players: state.setup.players.map((player) => ({
        id: player.id,
        name: player.name.trim(),
        isYou: player.id === state.setup.youId,
      })),
      yourHand: state.setup.yourHand,
      publicCards: state.setup.publicCards,
    });
    if (!created.ok) {
      state.setup.error = created.error;
      render();
      return;
    }
    state.game = created.game;
    state.screen = "play";
    state.setup.error = "";
    scrollTop = 0;
    save();
    render();
  }

  function loadExample() {
    const loaded = E.articleGame(2);
    state.game = loaded.game;
    state.screen = "play";
    state.setup = {
      step: "players",
      players: loaded.game.players.map((player) => ({ id: player.id, name: player.name })),
      youId: "you",
      yourHand: [...loaded.game.yourHand],
      publicCards: [...loaded.game.publicCards],
      error: "",
    };
    state.wizard = null;
    state.detailId = null;
    flashCards(["library"]);
    showToast("Walkthrough: Karen has the Library. Guess 1's other number was crossed out.");
    scrollTop = 0;
    save();
    render();
  }

  function undo() {
    if (!state.game || !state.game.suggestions.length) return;
    state.game.suggestions.pop();
    state.detailId = null;
    showToast("Removed the last guess.");
    save();
    render();
  }

  function askNewGame() {
    if (state.game && state.game.suggestions.length) {
      state.modal = {
        title: "Start a new sheet?",
        body: "This clears the guesses on this sheet. Seat names stay so you can deal again.",
        confirm: "Clear sheet",
      };
      render();
      return;
    }
    resetSheet();
  }

  function confirmModal() {
    state.modal = null;
    resetSheet();
  }

  function resetSheet() {
    const players = state.game
      ? state.game.players.map((player) => ({ id: player.id, name: player.name }))
      : state.setup.players;
    const you = state.game ? state.game.players.find((player) => player.isYou) : null;
    state.screen = "setup";
    state.game = null;
    state.wizard = null;
    state.detailId = null;
    state.setup = {
      step: "players",
      players,
      youId: you ? you.id : state.setup.youId,
      yourHand: [],
      publicCards: [],
      error: "",
    };
    scrollTop = 0;
    save();
    render();
  }

  function wizardBack() {
    const wizard = state.wizard;
    if (wizard.pendingId) {
      wizard.pendingId = null;
      wizard.responses = [];
      render();
      return;
    }
    if (wizard.suggesterId && wizard.suspectId && wizard.weaponId && wizard.roomId) {
      wizard.suggesterId = null;
      wizard.responses = [];
      render();
      return;
    }
    state.wizard = null;
    render();
  }

  function pickRow(cardId) {
    const wizard = state.wizard;
    if (!wizard) return;
    if (wizard.pendingId) return commitShow(cardId);
    const card = E.CARD_MAP[cardId];
    if (!card) return;
    pickGuess(card.category, cardId);
  }

  function pickGuess(category, cardId) {
    const key = category === "suspects" ? "suspectId" : category === "weapons" ? "weaponId" : "roomId";
    state.wizard[key] = state.wizard[key] === cardId ? null : cardId;
    state.wizard.pendingId = null;
    state.wizard.responses = [];
    render();
  }

  function chooseShower(playerId) {
    const wizard = state.wizard;
    const order = E.responseOrder(state.game.players, wizard.suggesterId);
    if (playerId === "all") {
      wizard.pendingId = null;
      wizard.responses = order.map((player) => ({ playerId: player.id, type: "pass", cardId: null }));
      commitSuggestion();
      return;
    }
    const you = state.game.players.find((player) => player.isYou);
    if (you && wizard.suggesterId === you.id && playerId !== you.id) {
      wizard.pendingId = playerId;
      wizard.responses = [];
      render();
      const row = document.getElementById("row-" + wizard.suspectId);
      if (row) row.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    wizard.pendingId = null;
    wizard.responses = responsesUntil(order, playerId, null);
    commitSuggestion();
  }

  function responsesUntil(order, showerId, cardId) {
    const responses = [];
    for (const player of order) {
      if (player.id === showerId) {
        responses.push({ playerId: player.id, type: "show", cardId });
        break;
      }
      responses.push({ playerId: player.id, type: "pass", cardId: null });
    }
    return responses;
  }

  function commitShow(cardId) {
    const wizard = state.wizard;
    const cards = [wizard.suspectId, wizard.weaponId, wizard.roomId];
    if (!wizard.pendingId || !cards.includes(cardId)) {
      showToast("Tap one of the three cards they might have shown.");
      render();
      return;
    }
    const order = E.responseOrder(state.game.players, wizard.suggesterId);
    wizard.responses = responsesUntil(order, wizard.pendingId, cardId);
    commitSuggestion();
  }

  function commitSuggestion() {
    const wizard = state.wizard;
    const result = E.tryAddSuggestion(state.game, {
      suggesterId: wizard.suggesterId,
      suspectId: wizard.suspectId,
      weaponId: wizard.weaponId,
      roomId: wizard.roomId,
      responses: wizard.responses,
    });
    if (!result.ok) {
      wizard.responses = [];
      showToast(result.error);
      render();
      return;
    }
    const lines = E.newFacts(result.before, result.after, result.game);
    const changed = E.CARDS.filter((card) => {
      const prev = result.before.owners[card.id];
      const next = result.after.owners[card.id];
      return next && next.kind !== "you" && next.kind !== "public" && (!prev || prev.kind !== next.kind || prev.playerId !== next.playerId);
    }).map((card) => card.id);
    state.game = result.game;
    state.wizard = null;
    flashCards(changed);
    const solvedNow = E.envelopeStatus(result.after).solved;
    const solvedBefore = E.envelopeStatus(result.before).solved;
    if (solvedNow && !solvedBefore) showToast("Ready to accuse: " + envelopePhrase(E.envelopeStatus(result.after)));
    else if (lines.length) showToast(lines.join(". ") + ".");
    else showToast(describeEntry(result.game, result.after));
    save();
    render();
  }

  function envelopePhrase(status) {
    const suspect = status.byCategory.suspects.known.name;
    const weapon = status.byCategory.weapons.known.name;
    const room = status.byCategory.rooms.known.name;
    return `${suspect}, with the ${weapon}, in the ${room}`;
  }

  function describeEntry(game, analysis) {
    const suggestion = game.suggestions[game.suggestions.length - 1];
    const number = game.suggestions.length;
    const show = [...suggestion.responses].reverse().find((response) => response.type === "show");
    if (!show) return `Guess ${number} saved. Everybody passed.`;
    const shower = playerById(game, show.playerId);
    if (show.cardId) return `${shower.name} showed you ${E.cardPhrase(E.CARD_MAP[show.cardId])}.`;
    if (shower.isYou) return `Guess ${number} saved. You showed a card.`;
    const marked = E.CARDS.filter((card) => analysis.marks[shower.id]?.[card.id]?.includes(number));
    if (marked.length > 1) {
      return `Guess ${number}: ${marked.map((card) => card.name).join(" and ")} marked for ${shower.name}.`;
    }
    return `Guess ${number} saved.`;
  }

  render();
})();
