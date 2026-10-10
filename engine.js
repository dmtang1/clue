(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClueEngine = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const CATEGORIES = [
    {
      id: "suspects",
      label: "Suspects",
      singular: "suspect",
      cards: [
        { id: "scarlet", name: "Miss Scarlet", short: "Scarlet" },
        { id: "mustard", name: "Colonel Mustard", short: "Mustard" },
        { id: "white", name: "Mrs. White", short: "White" },
        { id: "green", name: "Mr. Green", short: "Green" },
        { id: "peacock", name: "Mrs. Peacock", short: "Peacock" },
        { id: "plum", name: "Professor Plum", short: "Plum" },
      ],
    },
    {
      id: "weapons",
      label: "Weapons",
      singular: "weapon",
      cards: [
        { id: "candlestick", name: "Candlestick", short: "Candlestick" },
        { id: "knife", name: "Knife", short: "Knife" },
        { id: "pipe", name: "Lead Pipe", short: "Pipe" },
        { id: "revolver", name: "Revolver", short: "Revolver" },
        { id: "rope", name: "Rope", short: "Rope" },
        { id: "wrench", name: "Wrench", short: "Wrench" },
      ],
    },
    {
      id: "rooms",
      label: "Rooms",
      singular: "room",
      cards: [
        { id: "kitchen", name: "Kitchen", short: "Kitchen" },
        { id: "ballroom", name: "Ballroom", short: "Ballroom" },
        { id: "conservatory", name: "Conservatory", short: "Conservatory" },
        { id: "dining", name: "Dining Room", short: "Dining" },
        { id: "billiard", name: "Billiard Room", short: "Billiard" },
        { id: "library", name: "Library", short: "Library" },
        { id: "lounge", name: "Lounge", short: "Lounge" },
        { id: "hall", name: "Hall", short: "Hall" },
        { id: "study", name: "Study", short: "Study" },
      ],
    },
  ];

  const CARDS = CATEGORIES.flatMap((category) =>
    category.cards.map((card) => ({ ...card, category: category.id }))
  );
  const CARD_MAP = Object.fromEntries(CARDS.map((card) => [card.id, card]));
  const OUTSIDE_ENVELOPE = 18;

  function categoryOf(cardId) {
    return CATEGORIES.find((category) => category.cards.some((card) => card.id === cardId));
  }

  function cardName(cardId) {
    return CARD_MAP[cardId] ? CARD_MAP[cardId].name : "that card";
  }

  function dealExpectation(playerCount) {
    const publicCards = OUTSIDE_ENVELOPE % playerCount;
    const handSize = (OUTSIDE_ENVELOPE - publicCards) / playerCount;
    return { publicCards, handSize };
  }

  function responseOrder(players, suggesterId) {
    const start = players.findIndex((player) => player.id === suggesterId);
    if (start < 0) return [];
    const order = [];
    for (let step = 1; step < players.length; step += 1) {
      order.push(players[(start + step) % players.length]);
    }
    return order;
  }

  function createGame(input) {
    const players = (input.players || []).map((player) => ({
      id: String(player.id || "").trim(),
      name: String(player.name || "").trim(),
      isYou: Boolean(player.isYou),
    }));
    const yourHand = [...(input.yourHand || [])];
    const publicCards = [...(input.publicCards || [])];

    if (players.length < 2 || players.length > 6) {
      return { ok: false, error: "Clue needs 2 to 6 players." };
    }
    if (players.filter((player) => player.isYou).length !== 1) {
      return { ok: false, error: "Mark exactly one seat as you." };
    }
    if (players.some((player) => !player.id || !player.name)) {
      return { ok: false, error: "Every seat needs a name." };
    }
    const names = new Set(players.map((player) => player.name.toLowerCase()));
    if (names.size !== players.length) {
      return { ok: false, error: "Player names have to be different." };
    }
    const ids = new Set(players.map((player) => player.id));
    if (ids.size !== players.length) {
      return { ok: false, error: "Player ids have to be different." };
    }

    const seen = new Set();
    for (const cardId of [...yourHand, ...publicCards]) {
      if (!CARD_MAP[cardId]) return { ok: false, error: "That card is not in this set." };
      if (seen.has(cardId)) {
        return { ok: false, error: `${cardName(cardId)} can't be in two places.` };
      }
      seen.add(cardId);
    }

    const expected = dealExpectation(players.length);
    const handSizeOk = yourHand.length * players.length + publicCards.length === OUTSIDE_ENVELOPE;

    return {
      ok: true,
      game: {
        players,
        yourHand,
        publicCards,
        suggestions: [],
      },
      deal: {
        ...expected,
        handSizeOk,
        yourHand: yourHand.length,
        publicEntered: publicCards.length,
      },
    };
  }

  function otherPlayers(game) {
    return game.players.filter((player) => !player.isYou);
  }

  function youPlayer(game) {
    return game.players.find((player) => player.isYou);
  }

  function playerName(game, playerId) {
    const player = game.players.find((item) => item.id === playerId);
    return player ? player.name : "That player";
  }

  function suggestionCards(suggestion) {
    return [suggestion.suspectId, suggestion.weaponId, suggestion.roomId];
  }

  function analyze(game) {
    const others = otherPlayers(game);
    const yourHand = new Set(game.yourHand);
    const publicCards = new Set(game.publicCards);
    const owners = {};
    const eliminated = {};
    others.forEach((player) => {
      eliminated[player.id] = {};
    });
    const contradictions = [];
    let broken = false;
    const handSizeOk =
      game.yourHand.length * game.players.length + game.publicCards.length === OUTSIDE_ENVELOPE;
    const handSize = game.yourHand.length;

    function fail(message) {
      if (!contradictions.includes(message)) contradictions.push(message);
      broken = true;
    }

    function setOwner(cardId, next, reason) {
      if (broken) return;
      const normalized = { kind: next.kind, playerId: next.playerId || null, reason };
      const prev = owners[cardId];
      if (prev) {
        if (prev.kind !== normalized.kind || prev.playerId !== normalized.playerId) {
          fail(
            `${cardName(cardId)} can't be ${describeOwner(game, prev)} and ${describeOwner(game, normalized)}.`
          );
        }
        return;
      }
      if (normalized.kind === "envelope") {
        const category = categoryOf(cardId);
        const existing = category.cards.find((card) => owners[card.id]?.kind === "envelope");
        if (existing) {
          fail(
            `Two ${category.singular}s can't both be in the envelope: ${existing.name} and ${cardName(cardId)}.`
          );
          return;
        }
      }
      owners[cardId] = normalized;
    }

    function eliminate(playerId, cardId, reason) {
      if (broken) return;
      const owner = owners[cardId];
      if (owner?.kind === "player" && owner.playerId === playerId) {
        fail(`${playerName(game, playerId)} can't both have and lack ${cardName(cardId)}.`);
        return;
      }
      if (eliminated[playerId][cardId]) return;
      eliminated[playerId][cardId] = reason;
    }

    let guard = 0;
    let changed = true;
    while (changed && !broken && guard < 200) {
      guard += 1;
      changed = false;
      const before = snapshot(owners, eliminated);

      game.yourHand.forEach((cardId) => {
        setOwner(cardId, { kind: "you" }, "In your hand.");
      });
      game.publicCards.forEach((cardId) => {
        setOwner(cardId, { kind: "public" }, "Shown to everyone before the deal.");
      });

      CARDS.forEach((card) => {
        const owner = owners[card.id];
        if (!owner) return;
        if (owner.kind === "player") {
          others.forEach((player) => {
            if (player.id !== owner.playerId) {
              eliminate(player.id, card.id, `${playerName(game, owner.playerId)} has this card.`);
            }
          });
        } else if (owner.kind === "you") {
          others.forEach((player) => eliminate(player.id, card.id, "In your hand."));
        } else if (owner.kind === "public") {
          others.forEach((player) => eliminate(player.id, card.id, "Shown to everyone before the deal."));
        } else if (owner.kind === "envelope") {
          others.forEach((player) => eliminate(player.id, card.id, "In the envelope."));
        }
      });

      if (others.length) {
        CARDS.forEach((card) => {
          if (owners[card.id] || yourHand.has(card.id) || publicCards.has(card.id)) return;
          const everyoneOut = others.every((player) => eliminated[player.id][card.id]);
          if (everyoneOut) {
            const category = categoryOf(card.id);
            const existing = category.cards.find((item) => owners[item.id]?.kind === "envelope");
            if (existing) {
              fail(
                `${card.name} has nowhere to go. ${existing.name} is already the ${category.singular} in the envelope.`
              );
              return;
            }
            setOwner(
              card.id,
              { kind: "envelope" },
              "Crossed out for every player, and it isn't in your hand or the shared cards."
            );
          }
        });
      }

      CATEGORIES.forEach((category) => {
        const envelope = category.cards.find((card) => owners[card.id]?.kind === "envelope");
        if (envelope) return;
        const unknown = category.cards.filter((card) => !owners[card.id]);
        if (unknown.length === 1) {
          setOwner(
            unknown[0].id,
            { kind: "envelope" },
            `Every other ${category.singular} is already accounted for.`
          );
        }
      });

      game.suggestions.forEach((suggestion, index) => {
        const number = index + 1;
        const cards = suggestionCards(suggestion);
        suggestion.responses.forEach((response) => {
          const player = game.players.find((item) => item.id === response.playerId);
          if (!player || player.isYou) return;
          if (response.type === "pass") {
            cards.forEach((cardId) => {
              eliminate(player.id, cardId, `Passed on guess ${number}.`);
            });
          }
          if (response.type === "show" && response.cardId) {
            setOwner(response.cardId, { kind: "player", playerId: player.id }, `Shown to you on guess ${number}.`);
          }
        });

        const concealed = suggestion.responses.find((response) => {
          const player = game.players.find((item) => item.id === response.playerId);
          return response.type === "show" && !response.cardId && player && !player.isYou;
        });
        if (!concealed) return;
        const already = cards.find(
          (cardId) => owners[cardId]?.kind === "player" && owners[cardId].playerId === concealed.playerId
        );
        if (already) return;
        const possible = cards.filter((cardId) => {
          const owner = owners[cardId];
          if (owner && !(owner.kind === "player" && owner.playerId === concealed.playerId)) return false;
          if (eliminated[concealed.playerId][cardId]) return false;
          return true;
        });
        if (possible.length === 0) {
          fail(
            `${playerName(game, concealed.playerId)} showed a card for guess ${number}, but none of those cards can be theirs.`
          );
          return;
        }
        if (possible.length === 1) {
          setOwner(
            possible[0],
            { kind: "player", playerId: concealed.playerId },
            `Only card ${playerName(game, concealed.playerId)} could have shown for guess ${number}.`
          );
        }
      });

      if (handSizeOk) {
        others.forEach((player) => {
          const confirmed = CARDS.filter(
            (card) => owners[card.id]?.kind === "player" && owners[card.id].playerId === player.id
          );
          const possible = CARDS.filter((card) => {
            const owner = owners[card.id];
            if (eliminated[player.id][card.id]) return false;
            if (owner && !(owner.kind === "player" && owner.playerId === player.id)) return false;
            return true;
          });
          if (confirmed.length > handSize) {
            fail(`${player.name}'s hand is full at ${handSize} cards, but the sheet gives them more.`);
            return;
          }
          if (confirmed.length === handSize) {
            CARDS.forEach((card) => {
              if (!confirmed.some((held) => held.id === card.id)) {
                eliminate(player.id, card.id, `${player.name}'s hand is full.`);
              }
            });
          } else if (possible.length === handSize && possible.length > confirmed.length) {
            possible.forEach((card) => {
              setOwner(
                card.id,
                { kind: "player", playerId: player.id },
                `${player.name} needs ${handSize} cards, and these are the only ones left.`
              );
            });
          }
        });
      }

      pinEnvelopeHolders();
      coverNumberedGuesses();

      if (!sameSnapshot(before, snapshot(owners, eliminated))) changed = true;
    }

    if (guard >= 200 && !broken) {
      fail("The sheet could not settle. Undo the last guess.");
    }

    function pinEnvelopeHolders() {
      if (broken) return;
      CATEGORIES.forEach((category) => {
        const env = category.cards.find((card) => owners[card.id]?.kind === "envelope");
        if (!env) return;
        category.cards.forEach((card) => {
          if (owners[card.id]) return;
          const who = others.filter((player) => !eliminated[player.id][card.id]);
          if (!who.length) {
            fail(
              `${card.name} has nowhere to go. ${env.name} is already the ${category.singular} in the envelope.`
            );
            return;
          }
          if (who.length === 1) {
            setOwner(
              card.id,
              { kind: "player", playerId: who[0].id },
              `${env.name} is the ${category.singular} in the envelope, so ${who[0].name} has ${card.name}.`
            );
          }
        });
      });
    }

    function coverNumberedGuesses() {
      if (!handSizeOk || broken) return;
      others.forEach((player) => {
        if (broken) return;
        const confirmed = CARDS.filter(
          (card) => owners[card.id]?.kind === "player" && owners[card.id].playerId === player.id
        );
        const slots = handSize - confirmed.length;
        if (slots <= 0) return;
        const pool = CARDS.filter((card) => {
          if (confirmed.some((held) => held.id === card.id)) return false;
          if (eliminated[player.id][card.id]) return false;
          if (owners[card.id]) return false;
          return true;
        });
        if (pool.length < slots) {
          fail(`${player.name} needs ${slots} more cards, but only ${pool.length} fit.`);
          return;
        }
        const sets = [];
        game.suggestions.forEach((suggestion, index) => {
          const number = index + 1;
          const cards = suggestionCards(suggestion);
          const showed = suggestion.responses.some((response) => {
            return response.playerId === player.id && response.type === "show" && !response.cardId;
          });
          if (!showed) return;
          if (
            cards.some(
              (cardId) => owners[cardId]?.kind === "player" && owners[cardId].playerId === player.id
            )
          ) {
            return;
          }
          const open = cards.filter((cardId) => pool.some((card) => card.id === cardId));
          if (!open.length) {
            fail(
              `${player.name} showed a card for guess ${number}, but none of those cards can be theirs.`
            );
            return;
          }
          sets.push(open);
        });
        if (broken || !sets.length) return;
        if (binom(pool.length, slots) > 12000) return;
        const hits = {};
        pool.forEach((card) => {
          hits[card.id] = 0;
        });
        let valid = 0;
        eachCombination(pool, slots, (combo) => {
          const ids = new Set(combo.map((card) => card.id));
          if (!sets.every((set) => set.some((id) => ids.has(id)))) return;
          valid += 1;
          ids.forEach((id) => {
            hits[id] += 1;
          });
        });
        if (!valid) {
          fail(`${player.name}'s hand can't cover every card they showed.`);
          return;
        }
        pool.forEach((card) => {
          if (!hits[card.id]) {
            eliminate(
              player.id,
              card.id,
              `${player.name} can't hold this and still cover every numbered guess.`
            );
          } else if (hits[card.id] === valid) {
            setOwner(
              card.id,
              { kind: "player", playerId: player.id },
              `${player.name} needs this card to cover the numbered guesses in a hand of ${handSize}.`
            );
          }
        });
      });
    }

    const marks = {};
    others.forEach((player) => {
      marks[player.id] = {};
    });
    if (!broken) {
      game.suggestions.forEach((suggestion, index) => {
        const number = index + 1;
        const cards = suggestionCards(suggestion);
        const concealed = suggestion.responses.find((response) => {
          const player = game.players.find((item) => item.id === response.playerId);
          return response.type === "show" && !response.cardId && player && !player.isYou;
        });
        if (!concealed) return;
        const owned = cards.filter(
          (cardId) => owners[cardId]?.kind === "player" && owners[cardId].playerId === concealed.playerId
        );
        const targets = owned.length
          ? owned
          : cards.filter((cardId) => {
              const owner = owners[cardId];
              if (owner && !(owner.kind === "player" && owner.playerId === concealed.playerId)) return false;
              if (eliminated[concealed.playerId][cardId]) return false;
              return true;
            });
        targets.forEach((cardId) => {
          if (!marks[concealed.playerId][cardId]) marks[concealed.playerId][cardId] = [];
          marks[concealed.playerId][cardId].push(number);
        });
      });
    }

    return {
      owners,
      eliminated,
      marks,
      contradictions,
      handSizeOk,
      handSize,
      expected: dealExpectation(game.players.length),
    };
  }

  function describeOwner(game, owner) {
    if (owner.kind === "you") return "in your hand";
    if (owner.kind === "public") return "a shared card";
    if (owner.kind === "envelope") return "in the envelope";
    return `held by ${playerName(game, owner.playerId)}`;
  }

  function snapshot(owners, eliminated) {
    const ownerKey = Object.keys(owners)
      .sort()
      .map((id) => `${id}:${owners[id].kind}:${owners[id].playerId || ""}`)
      .join("|");
    const elimKey = Object.keys(eliminated)
      .sort()
      .map((playerId) => `${playerId}:${Object.keys(eliminated[playerId]).sort().join(",")}`)
      .join("|");
    return `${ownerKey}#${elimKey}`;
  }

  function sameSnapshot(a, b) {
    return a === b;
  }

  function binom(n, k) {
    if (k < 0 || n < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    const m = Math.min(k, n - k);
    for (let i = 1; i <= m; i += 1) {
      result = (result * (n - m + i)) / i;
      if (result > 20000) return 20001;
    }
    return result;
  }

  function eachCombination(items, k, visit) {
    const chosen = [];
    function walk(start) {
      if (chosen.length === k) {
        visit(chosen);
        return;
      }
      const need = k - chosen.length;
      for (let i = start; i <= items.length - need; i += 1) {
        chosen.push(items[i]);
        walk(i + 1);
        chosen.pop();
      }
    }
    walk(0);
  }

  function cardsPlayerCouldShow(analysis, game, playerId, cardIds) {
    const player = game.players.find((item) => item.id === playerId);
    if (!player) return [];
    if (player.isYou) return cardIds.filter((cardId) => game.yourHand.includes(cardId));
    return cardIds.filter((cardId) => {
      const owner = analysis.owners[cardId];
      if (owner && !(owner.kind === "player" && owner.playerId === playerId)) return false;
      if (analysis.eliminated[playerId]?.[cardId]) return false;
      return true;
    });
  }

  function tryAddSuggestion(game, suggestion) {
    const suspectId = suggestion.suspectId;
    const weaponId = suggestion.weaponId;
    const roomId = suggestion.roomId;
    const cards = [suspectId, weaponId, roomId];
    if (!CARD_MAP[suspectId] || CARD_MAP[suspectId].category !== "suspects") {
      return { ok: false, error: "Pick a suspect." };
    }
    if (!CARD_MAP[weaponId] || CARD_MAP[weaponId].category !== "weapons") {
      return { ok: false, error: "Pick a weapon." };
    }
    if (!CARD_MAP[roomId] || CARD_MAP[roomId].category !== "rooms") {
      return { ok: false, error: "Pick a room." };
    }

    const suggester = game.players.find((player) => player.id === suggestion.suggesterId);
    if (!suggester) return { ok: false, error: "Pick who asked." };
    const you = youPlayer(game);
    const order = responseOrder(game.players, suggester.id);
    const responses = suggestion.responses || [];
    if (!responses.length) return { ok: false, error: "Record who answered." };
    if (responses.length > order.length) return { ok: false, error: "Too many answers for that guess." };

    for (let i = 0; i < responses.length; i += 1) {
      const response = responses[i];
      if (!order[i] || response.playerId !== order[i].id) {
        return { ok: false, error: "Answers have to follow the seats to the asker's left." };
      }
      if (response.type !== "pass" && response.type !== "show") {
        return { ok: false, error: "Each player either passes or shows a card." };
      }
      if (response.type === "show" && i !== responses.length - 1) {
        return { ok: false, error: "A shown card ends the guess." };
      }
    }

    const last = responses[responses.length - 1];
    if (last.type === "pass" && responses.length !== order.length) {
      return { ok: false, error: "Keep going until someone shows a card, or everyone passes." };
    }

    const prior = analyze(game);
    if (prior.contradictions.length) {
      return { ok: false, error: prior.contradictions[0] };
    }

    for (const response of responses) {
      const player = game.players.find((item) => item.id === response.playerId);
      const could = cardsPlayerCouldShow(prior, game, player.id, cards);
      if (player.isYou && response.type === "pass" && could.length) {
        return {
          ok: false,
          error: `You hold ${could.map(cardName).join(" and ")}, so you would show a card.`,
        };
      }
      if (player.isYou && response.type === "show" && !could.length) {
        return { ok: false, error: "You don't hold any of those cards, so you would pass." };
      }
      if (!player.isYou && response.type === "show" && !could.length) {
        return { ok: false, error: `${player.name} is already crossed off for all three cards.` };
      }
      if (response.type === "show" && response.cardId) {
        if (suggester.id !== you.id) {
          return { ok: false, error: "You only see the card when the guess is yours." };
        }
        if (!cards.includes(response.cardId)) {
          return { ok: false, error: "That card was not part of the guess." };
        }
        if (!could.includes(response.cardId)) {
          return { ok: false, error: `${player.name} can't have ${cardName(response.cardId)}.` };
        }
      }
      if (response.type === "show" && !response.cardId && suggester.id === you.id && !player.isYou) {
        return { ok: false, error: "Pick the card they showed you." };
      }
    }

    const next = cloneGame(game);
    next.suggestions.push({
      suggesterId: suggester.id,
      suspectId,
      weaponId,
      roomId,
      responses: responses.map((response) => ({
        playerId: response.playerId,
        type: response.type,
        cardId: response.cardId || null,
      })),
    });
    const after = analyze(next);
    if (after.contradictions.length) {
      return { ok: false, error: after.contradictions[0] };
    }
    return { ok: true, game: next, before: prior, after };
  }

  function cloneGame(game) {
    return {
      players: game.players.map((player) => ({ ...player })),
      yourHand: [...game.yourHand],
      publicCards: [...game.publicCards],
      suggestions: game.suggestions.map((suggestion) => ({
        ...suggestion,
        responses: suggestion.responses.map((response) => ({ ...response })),
      })),
    };
  }

  function cardPhrase(card) {
    if (card.category === "suspects") return card.name;
    return `the ${card.name}`;
  }

  function newFacts(before, after, game) {
    const lines = [];
    CARDS.forEach((card) => {
      const prev = before.owners[card.id];
      const next = after.owners[card.id];
      if (!next) return;
      if (prev && prev.kind === next.kind && prev.playerId === next.playerId) return;
      if (next.kind === "you" || next.kind === "public") return;
      if (next.kind === "envelope") {
        const phrase = cardPhrase(card);
        lines.push(`${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} is in the envelope`);
      }
      if (next.kind === "player") {
        lines.push(`${playerName(game, next.playerId)} has ${cardPhrase(card)}`);
      }
    });
    return lines;
  }

  function envelopeStatus(analysis) {
    const byCategory = {};
    CATEGORIES.forEach((category) => {
      const known = category.cards.find((card) => analysis.owners[card.id]?.kind === "envelope");
      const remaining = category.cards.filter((card) => !analysis.owners[card.id]);
      byCategory[category.id] = {
        known: known || null,
        remaining,
      };
    });
    const solved = CATEGORIES.every((category) => byCategory[category.id].known);
    return { byCategory, solved };
  }

  function isControlCard(cardId, game, analysis) {
    if (game.yourHand.includes(cardId)) return true;
    if (game.publicCards.includes(cardId)) return true;
    return analysis.owners[cardId]?.kind === "envelope";
  }

  function possibleHolders(cardId, analysis, game) {
    return otherPlayers(game).filter((player) => !analysis.eliminated[player.id]?.[cardId]);
  }

  function markBonus(cardId, analysis) {
    let bonus = 0;
    Object.keys(analysis.marks).forEach((playerId) => {
      const row = analysis.marks[playerId];
      (row[cardId] || []).forEach((num) => {
        const mates = Object.keys(row).filter((id) => (row[id] || []).includes(num)).length;
        if (mates >= 2) bonus += mates === 2 ? 40 : 20;
      });
    });
    return bonus;
  }

  function probeValue(cardId, analysis) {
    const category = categoryOf(cardId);
    const envelopeKnown = category.cards.some((card) => analysis.owners[card.id]?.kind === "envelope");
    const open = category.cards.filter((card) => !analysis.owners[card.id]).length;
    let value = envelopeKnown ? 80 : 500;
    if (!envelopeKnown) {
      value += open <= 2 ? 400 : Math.max(0, 180 - open * 25);
    }
    value += markBonus(cardId, analysis);
    return value;
  }

  function sentence(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function joinPhrases(ids) {
    const names = ids.map((id) => cardPhrase(CARD_MAP[id]));
    if (names.length <= 1) return names[0] || "";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }

  function controlClause(ids, game, analysis) {
    const yours = ids.filter((id) => game.yourHand.includes(id));
    const shared = ids.filter((id) => game.publicCards.includes(id));
    const envelope = ids.filter((id) => analysis.owners[id]?.kind === "envelope");
    const parts = [];
    if (yours.length) parts.push(`you hold ${joinPhrases(yours)}`);
    if (shared.length) parts.push(`${joinPhrases(shared)} ${shared.length > 1 ? "are" : "is"} already shared`);
    if (envelope.length) {
      parts.push(`${joinPhrases(envelope)} ${envelope.length > 1 ? "are" : "is"} already in the envelope`);
    }
    return parts.join(", and ");
  }

  function markSentence(cardIds, analysis, game) {
    const bits = [];
    cardIds.forEach((cardId) => {
      Object.keys(analysis.marks).forEach((playerId) => {
        const row = analysis.marks[playerId];
        const nums = (row[cardId] || []).filter((num) => {
          return Object.keys(row).filter((id) => (row[id] || []).includes(num)).length >= 2;
        });
        if (!nums.length) return;
        bits.push(`${playerName(game, playerId)}'s guess ${nums.join(" and ")}`);
      });
    });
    const unique = [...new Set(bits)];
    if (!unique.length) return "";
    return ` That settles ${unique.join(" and ")}.`;
  }

  function askReason(cards, focusId, analysis, game) {
    const live = cards.filter((id) => !analysis.owners[id]);
    const focus = CARD_MAP[focusId];
    const controls = cards.filter((id) => id !== focusId && isControlCard(id, game, analysis));
    const controlLead = controls.length ? `${sentence(controlClause(controls, game, analysis))}. ` : "";
    const note = markSentence(live, analysis, game);
    const category = categoryOf(focusId);
    const envelopeKnown = category.cards.some((card) => analysis.owners[card.id]?.kind === "envelope");
    const open = category.cards.filter((card) => !analysis.owners[card.id]);
    const other = open.find((card) => card.id !== focusId);
    const otherCard = other ? CARD_MAP[other.id] : null;
    const holders = possibleHolders(focusId, analysis, game);
    const hold = cardPhrase(focus);

    if (live.length === 1 && holders.length === 1) {
      const name = holders[0].name;
      if (!envelopeKnown && open.length === 2 && other) {
        return `${controlLead}Only ${name} can still have ${hold}. If ${name} has it, ${cardPhrase(otherCard)} is in the envelope. If ${name} passes, ${hold} is.${note}`;
      }
      if (!envelopeKnown) {
        return `${controlLead}Only ${name} can still have ${hold}. If ${name} passes, it's in the envelope.${note}`;
      }
      return `${controlLead}Only ${name} can still have ${hold}.${note}`;
    }
    if (live.length === 1 && !envelopeKnown && open.length === 2 && other) {
      return `${controlLead}If someone shows a card, they have ${hold}, and ${cardPhrase(otherCard)} is in the envelope. If everyone passes, ${hold} is.${note}`;
    }
    if (live.length === 1 && !envelopeKnown) {
      return `${controlLead}If someone shows a card, they have ${hold}. If everyone passes, it's in the envelope.${note}`;
    }
    if (live.length === 1) {
      return `${controlLead}If someone shows a card, they have ${hold}.${note}`;
    }
    const listed = joinPhrases(live).replace(" and ", " or ");
    return `${controlLead}A shown card is ${listed}.${note}`;
  }

  function recommendAsk(game, analysis) {
    const sheet = analysis || analyze(game);
    if (sheet.contradictions.length || envelopeStatus(sheet).solved) return null;

    const valueOf = {};
    const holdersOf = {};
    CARDS.forEach((card) => {
      if (sheet.owners[card.id]) return;
      valueOf[card.id] = probeValue(card.id, sheet);
      holdersOf[card.id] = possibleHolders(card.id, sheet, game).length;
    });

    const you = youPlayer(game);
    let best = null;

    CATEGORIES[0].cards.forEach((suspect) => {
      CATEGORIES[1].cards.forEach((weapon) => {
        CATEGORIES[2].cards.forEach((room) => {
          const cards = [suspect.id, weapon.id, room.id];
          const live = cards.filter((id) => !sheet.owners[id]);
          if (!live.length) return;

          const order = responseOrder(game.players, you.id);
          const muddyPlayers = order.filter(
            (player) => cardsPlayerCouldShow(sheet, game, player.id, cards).length > 1
          ).length;
          const knownHeld = cards.filter((id) => sheet.owners[id]?.kind === "player").length;
          const clean = muddyPlayers === 0 && knownHeld === 0;
          const focusId = live.slice().sort((a, b) => {
            if (valueOf[b] !== valueOf[a]) return valueOf[b] - valueOf[a];
            if (holdersOf[a] !== holdersOf[b]) return holdersOf[a] - holdersOf[b];
            return CARDS.findIndex((card) => card.id === a) - CARDS.findIndex((card) => card.id === b);
          })[0];
          const controlScore = cards.reduce((sum, id) => {
            if (game.yourHand.includes(id)) return sum + 3;
            if (game.publicCards.includes(id)) return sum + 2;
            if (sheet.owners[id]?.kind === "envelope") return sum + 1;
            return sum;
          }, 0);
          const orderKey = cards
            .map((id) => String(CARDS.findIndex((card) => card.id === id)).padStart(2, "0"))
            .join("");
          const candidate = {
            suspectId: suspect.id,
            weaponId: weapon.id,
            roomId: room.id,
            focusId,
            key: [clean ? 1 : 0, valueOf[focusId], -holdersOf[focusId], -knownHeld, -muddyPlayers, -live.length, controlScore],
            orderKey,
          };
          if (!best || preferAsk(candidate, best)) best = candidate;
        });
      });
    });

    if (!best) return null;
    const cards = [best.suspectId, best.weaponId, best.roomId];
    return {
      suspectId: best.suspectId,
      weaponId: best.weaponId,
      roomId: best.roomId,
      focusId: best.focusId,
      reason: askReason(cards, best.focusId, sheet, game),
    };
  }

  function preferAsk(a, b) {
    for (let i = 0; i < a.key.length; i += 1) {
      if (a.key[i] !== b.key[i]) return a.key[i] > b.key[i];
    }
    return a.orderKey < b.orderKey;
  }

  const ARTICLE_SETUP = {
    players: [
      { id: "you", name: "You", isYou: true },
      { id: "jack", name: "Jack", isYou: false },
      { id: "dana", name: "Dana", isYou: false },
      { id: "karen", name: "Karen", isYou: false },
    ],
    yourHand: ["scarlet", "kitchen", "lounge", "rope"],
    publicCards: ["billiard", "pipe"],
  };

  const ARTICLE_SUGGESTIONS = [
    {
      suggesterId: "jack",
      suspectId: "scarlet",
      weaponId: "candlestick",
      roomId: "library",
      responses: [
        { playerId: "dana", type: "pass" },
        { playerId: "karen", type: "show", cardId: null },
      ],
    },
    {
      suggesterId: "dana",
      suspectId: "plum",
      weaponId: "candlestick",
      roomId: "kitchen",
      responses: [
        { playerId: "karen", type: "pass" },
        { playerId: "you", type: "show", cardId: null },
      ],
    },
  ];

  function knownChance(game, analysis, player, cardId) {
    if (player.isYou) return game.yourHand.includes(cardId) ? 1 : 0;
    const owner = analysis.owners[cardId];
    if (owner?.kind === "player" && owner.playerId === player.id) return 1;
    if (owner || analysis.eliminated[player.id]?.[cardId]) return 0;
    return 0;
  }

  function holdChances(game, analysis) {
    const sheet = analysis || analyze(game);
    const chances = {};
    game.players.forEach((player) => {
      chances[player.id] = {};
      CARDS.forEach((card) => {
        chances[player.id][card.id] = knownChance(game, sheet, player, card.id);
      });
    });
    if (sheet.contradictions.length) return chances;

    const others = otherPlayers(game);
    const pool = CARDS.filter((card) => !sheet.owners[card.id]);
    if (!pool.length || !others.length) return chances;

    let dealt = sheet.handSizeOk ? countConsistentDeals(game, sheet, others, pool, true) : null;
    if (!dealt && sheet.handSizeOk) dealt = countConsistentDeals(game, sheet, others, pool, false);
    if (!dealt) dealt = independentChances(sheet, others, pool);

    others.forEach((player) => {
      pool.forEach((card) => {
        const value = dealt[player.id][card.id] || 0;
        chances[player.id][card.id] = value < 1e-12 ? 0 : value > 1 ? 1 : value;
      });
    });
    return chances;
  }

  function openShowConstraints(game, analysis, others, pool) {
    const indexOf = Object.fromEntries(pool.map((card, index) => [card.id, index]));
    const constraints = [];
    for (const suggestion of game.suggestions) {
      const cards = suggestionCards(suggestion);
      const concealed = suggestion.responses.find((response) => {
        const player = game.players.find((item) => item.id === response.playerId);
        return response.type === "show" && !response.cardId && player && !player.isYou;
      });
      if (!concealed) continue;
      const playerIndex = others.findIndex((player) => player.id === concealed.playerId);
      if (playerIndex < 0) continue;
      const already = cards.some((cardId) => {
        const owner = analysis.owners[cardId];
        return owner?.kind === "player" && owner.playerId === concealed.playerId;
      });
      if (already) continue;
      const cardIndexes = [];
      cards.forEach((cardId) => {
        if (analysis.eliminated[concealed.playerId]?.[cardId]) return;
        if (indexOf[cardId] === undefined) return;
        cardIndexes.push(indexOf[cardId]);
      });
      if (cardIndexes.length) constraints.push({ playerIndex, cardIndexes });
    }
    return constraints;
  }

  function countConsistentDeals(game, analysis, others, pool, useConstraints) {
    const caps = others.map((player) => {
      const confirmed = CARDS.reduce((count, card) => {
        const owner = analysis.owners[card.id];
        return count + (owner?.kind === "player" && owner.playerId === player.id ? 1 : 0);
      }, 0);
      return analysis.handSize - confirmed;
    });
    if (caps.some((cap) => cap < 0)) return null;

    const envCats = CATEGORIES.filter(
      (category) => !category.cards.some((card) => analysis.owners[card.id]?.kind === "envelope")
    ).map((category) => category.id);
    const envIndex = Object.fromEntries(envCats.map((id, index) => [id, index]));
    const constraints = useConstraints ? openShowConstraints(game, analysis, others, pool) : [];
    if (constraints.length > 12) return null;

    const strides = [];
    let countStates = 1;
    caps.forEach((cap) => {
      strides.push(countStates);
      countStates *= cap + 1;
    });
    const envStates = 1 << envCats.length;
    const maskStates = 1 << constraints.length;
    const block = countStates * envStates;
    const total = block * maskStates;
    if (total > 120000 || total * Math.max(pool.length, 1) > 2500000) return null;

    const eligible = pool.map((card) => ({
      players: others
        .map((player, index) => (analysis.eliminated[player.id]?.[card.id] ? -1 : index))
        .filter((index) => index >= 0),
      envBit: Object.prototype.hasOwnProperty.call(envIndex, card.category) ? 1 << envIndex[card.category] : -1,
    }));
    const satisfy = pool.map(() => others.map(() => 0));
    constraints.forEach((constraint, bit) => {
      constraint.cardIndexes.forEach((cardIndex) => {
        satisfy[cardIndex][constraint.playerIndex] |= 1 << bit;
      });
    });

    const fullCounts = caps.reduce((sum, cap, index) => sum + cap * strides[index], 0);
    const fullEnv = envStates - 1;
    const completeMask = maskStates - 1;

    function pack(counts, env, mask) {
      return counts + env * countStates + mask * block;
    }

    const layers = [new Float64Array(total)];
    layers[0][pack(0, 0, 0)] = 1;
    for (let cardIndex = 0; cardIndex < pool.length; cardIndex += 1) {
      const prev = layers[cardIndex];
      const next = new Float64Array(total);
      const card = eligible[cardIndex];
      for (let state = 0; state < total; state += 1) {
        const ways = prev[state];
        if (!ways) continue;
        const mask = Math.floor(state / block);
        const rest = state % block;
        const env = Math.floor(rest / countStates);
        const counts = rest % countStates;
        if (card.envBit >= 0 && (env & card.envBit) === 0) {
          next[pack(counts, env | card.envBit, mask)] += ways;
        }
        card.players.forEach((playerIndex) => {
          const stride = strides[playerIndex];
          const filled = Math.floor(counts / stride) % (caps[playerIndex] + 1);
          if (filled >= caps[playerIndex]) return;
          next[pack(counts + stride, env, mask | satisfy[cardIndex][playerIndex])] += ways;
        });
      }
      layers.push(next);
    }

    const done = pack(fullCounts, fullEnv, completeMask);
    const totalWays = layers[pool.length][done];
    if (!totalWays) return null;

    const hits = others.map(() => new Float64Array(pool.length));
    let back = new Float64Array(total);
    back[done] = 1;
    for (let cardIndex = pool.length - 1; cardIndex >= 0; cardIndex -= 1) {
      const prev = layers[cardIndex];
      const before = new Float64Array(total);
      const card = eligible[cardIndex];
      for (let state = 0; state < total; state += 1) {
        const forward = prev[state];
        if (!forward) continue;
        const mask = Math.floor(state / block);
        const rest = state % block;
        const env = Math.floor(rest / countStates);
        const counts = rest % countStates;
        if (card.envBit >= 0 && (env & card.envBit) === 0) {
          const ways = back[pack(counts, env | card.envBit, mask)];
          if (ways) before[state] += ways;
        }
        card.players.forEach((playerIndex) => {
          const stride = strides[playerIndex];
          const filled = Math.floor(counts / stride) % (caps[playerIndex] + 1);
          if (filled >= caps[playerIndex]) return;
          const ways = back[pack(counts + stride, env, mask | satisfy[cardIndex][playerIndex])];
          if (!ways) return;
          before[state] += ways;
          hits[playerIndex][cardIndex] += forward * ways;
        });
      }
      back = before;
    }

    const dealt = {};
    others.forEach((player, playerIndex) => {
      dealt[player.id] = {};
      pool.forEach((card, cardIndex) => {
        dealt[player.id][card.id] = hits[playerIndex][cardIndex] / totalWays;
      });
    });
    return dealt;
  }

  function independentChances(analysis, others, pool) {
    const choices = CATEGORIES.map((category) => {
      const known = category.cards.some((card) => analysis.owners[card.id]?.kind === "envelope");
      if (known) return [];
      return category.cards.filter((card) => !analysis.owners[card.id]).map((card) => card.id);
    });
    const holders = {};
    pool.forEach((card) => {
      holders[card.id] = others
        .filter((player) => !analysis.eliminated[player.id]?.[card.id])
        .map((player) => player.id);
    });
    const hits = {};
    others.forEach((player) => {
      hits[player.id] = {};
      pool.forEach((card) => {
        hits[player.id][card.id] = 0;
      });
    });

    let total = 0;
    function visit(index, envelope) {
      if (index === choices.length) {
        let weight = 1;
        for (const card of pool) {
          if (envelope.has(card.id)) continue;
          const count = holders[card.id].length;
          if (!count) return;
          weight *= count;
          if (!Number.isFinite(weight)) return;
        }
        total += weight;
        pool.forEach((card) => {
          if (envelope.has(card.id)) return;
          const list = holders[card.id];
          const share = weight / list.length;
          list.forEach((id) => {
            hits[id][card.id] += share;
          });
        });
        return;
      }
      const options = choices[index];
      if (!options.length) {
        visit(index + 1, envelope);
        return;
      }
      options.forEach((id) => {
        envelope.add(id);
        visit(index + 1, envelope);
        envelope.delete(id);
      });
    }
    visit(0, new Set());
    if (!total) return hits;
    others.forEach((player) => {
      pool.forEach((card) => {
        hits[player.id][card.id] /= total;
      });
    });
    return hits;
  }

  function articleGame(count) {
    const created = createGame(ARTICLE_SETUP);
    if (!created.ok) return created;
    let game = created.game;
    const steps = typeof count === "number" ? count : ARTICLE_SUGGESTIONS.length;
    for (let i = 0; i < steps; i += 1) {
      const added = tryAddSuggestion(game, ARTICLE_SUGGESTIONS[i]);
      if (!added.ok) return added;
      game = added.game;
    }
    return { ok: true, game };
  }

  return {
    CATEGORIES,
    CARDS,
    CARD_MAP,
    OUTSIDE_ENVELOPE,
    dealExpectation,
    responseOrder,
    createGame,
    analyze,
    holdChances,
    tryAddSuggestion,
    cardsPlayerCouldShow,
    newFacts,
    envelopeStatus,
    recommendAsk,
    cloneGame,
    cardName,
    cardPhrase,
    categoryOf,
    ARTICLE_SETUP,
    ARTICLE_SUGGESTIONS,
    articleGame,
  };
});
