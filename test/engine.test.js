const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../engine");

const {
  analyze,
  articleGame,
  cardsPlayerCouldShow,
  createGame,
  dealExpectation,
  newFacts,
  recommendAsk,
  responseOrder,
  tryAddSuggestion,
} = engine;

test("a 4-player deal shows 2 cards and gives everyone 4", () => {
  assert.deepEqual(dealExpectation(4), { publicCards: 2, handSize: 4 });
  assert.deepEqual(dealExpectation(5), { publicCards: 3, handSize: 3 });
  assert.deepEqual(dealExpectation(6), { publicCards: 0, handSize: 3 });
  assert.deepEqual(dealExpectation(3), { publicCards: 0, handSize: 6 });
});

test("answers start with the player on the asker's left", () => {
  const players = [
    { id: "you", name: "You" },
    { id: "jack", name: "Jack" },
    { id: "dana", name: "Dana" },
    { id: "karen", name: "Karen" },
  ];
  assert.deepEqual(
    responseOrder(players, "jack").map((player) => player.id),
    ["dana", "karen", "you"]
  );
  assert.deepEqual(
    responseOrder(players, "dana").map((player) => player.id),
    ["karen", "you", "jack"]
  );
});

test("the article example gives the Library to Karen", () => {
  const first = articleGame(1);
  assert.equal(first.ok, true);
  const open = analyze(first.game);
  assert.deepEqual(open.marks.karen.library, [1]);
  assert.deepEqual(open.marks.karen.candlestick, [1]);
  assert.equal(open.marks.karen.scarlet, undefined);
  assert.equal(open.eliminated.dana.library, "Passed on guess 1.");
  assert.equal(open.eliminated.dana.candlestick, "Passed on guess 1.");
  assert.equal(open.owners.library, undefined);

  const second = articleGame(2);
  assert.equal(second.ok, true);
  const solved = analyze(second.game);
  assert.equal(solved.contradictions.length, 0);
  assert.equal(solved.owners.library.kind, "player");
  assert.equal(solved.owners.library.playerId, "karen");
  assert.deepEqual(solved.marks.karen.library, [1]);
  assert.equal(solved.marks.karen.candlestick, undefined);
  assert.ok(solved.eliminated.karen.candlestick);
  assert.ok(solved.eliminated.jack.library);
  assert.ok(solved.eliminated.dana.library);
  assert.equal(solved.owners.scarlet.kind, "you");
  assert.equal(solved.owners.pipe.kind, "public");
  assert.ok(solved.eliminated.jack.scarlet);
  assert.ok(solved.eliminated.karen.kitchen);

  const facts = newFacts(open, solved, second.game);
  assert.deepEqual(facts, ["Karen has the Library"]);
});

test("a card you are shown is a check, and the other columns are crossed out", () => {
  const started = articleGame(0);
  const added = tryAddSuggestion(started.game, {
    suggesterId: "you",
    suspectId: "plum",
    weaponId: "wrench",
    roomId: "study",
    responses: [{ playerId: "jack", type: "show", cardId: "study" }],
  });
  assert.equal(added.ok, true);
  const sheet = analyze(added.game);
  assert.equal(sheet.owners.study.playerId, "jack");
  assert.equal(sheet.owners.study.reason, "Shown to you on guess 1.");
  assert.ok(sheet.eliminated.dana.study);
  assert.ok(sheet.eliminated.karen.study);
  assert.equal(sheet.eliminated.jack.study, undefined);
  assert.equal(sheet.marks.jack.study, undefined);
});

test("if nobody can answer, those three cards are the envelope", () => {
  const created = createGame({
    players: [
      { id: "you", name: "You", isYou: true },
      { id: "a", name: "Avery", isYou: false },
      { id: "b", name: "Blair", isYou: false },
    ],
    yourHand: ["scarlet", "mustard", "candlestick", "knife", "kitchen", "ballroom"],
    publicCards: [],
  });
  const added = tryAddSuggestion(created.game, {
    suggesterId: "you",
    suspectId: "plum",
    weaponId: "wrench",
    roomId: "study",
    responses: [
      { playerId: "a", type: "pass" },
      { playerId: "b", type: "pass" },
    ],
  });
  assert.equal(added.ok, true);
  const sheet = analyze(added.game);
  assert.equal(sheet.owners.plum.kind, "envelope");
  assert.equal(sheet.owners.wrench.kind, "envelope");
  assert.equal(sheet.owners.study.kind, "envelope");
  assert.equal(sheet.owners.white, undefined);
});

test("the last unaccounted card in a category is in the envelope", () => {
  const created = createGame({
    players: [
      { id: "you", name: "You", isYou: true },
      { id: "a", name: "Avery", isYou: false },
      { id: "b", name: "Blair", isYou: false },
    ],
    yourHand: ["scarlet", "mustard", "white", "green", "peacock", "rope"],
    publicCards: [],
  });
  const sheet = analyze(created.game);
  assert.equal(sheet.owners.plum.kind, "envelope");
  assert.match(sheet.owners.plum.reason, /other suspect/i);
});

test("a full hand crosses the rest of that column out", () => {
  const started = articleGame(0);
  let game = started.game;
  const shown = ["mustard", "ballroom", "knife", "conservatory"];
  for (const cardId of shown) {
    const category = engine.CARD_MAP[cardId].category;
    const added = tryAddSuggestion(game, {
      suggesterId: "you",
      suspectId: category === "suspects" ? cardId : "plum",
      weaponId: category === "weapons" ? cardId : "wrench",
      roomId: category === "rooms" ? cardId : "study",
      responses: [{ playerId: "jack", type: "show", cardId }],
    });
    assert.equal(added.ok, true, added.error);
    game = added.game;
  }
  const full = analyze(game);
  assert.equal(full.owners.mustard.playerId, "jack");
  assert.equal(full.owners.conservatory.playerId, "jack");
  assert.equal(full.eliminated.jack.library, "Jack's hand is full.");
  assert.equal(full.handSizeOk, true);

  const uneven = createGame({
    players: ARTICLE_PLAYERS(),
    yourHand: ["scarlet", "kitchen", "lounge", "rope"],
    publicCards: [],
  });
  let loose = uneven.game;
  for (const cardId of shown) {
    const category = engine.CARD_MAP[cardId].category;
    const added = tryAddSuggestion(loose, {
      suggesterId: "you",
      suspectId: category === "suspects" ? cardId : "plum",
      weaponId: category === "weapons" ? cardId : "wrench",
      roomId: category === "rooms" ? cardId : "study",
      responses: [{ playerId: "jack", type: "show", cardId }],
    });
    assert.equal(added.ok, true, added.error);
    loose = added.game;
  }
  const off = analyze(loose);
  assert.equal(off.handSizeOk, false);
  assert.equal(off.eliminated.jack.library, undefined);
});

test("a seen card you could not hold is rejected, and the log stays put", () => {
  const started = articleGame(0);
  const added = tryAddSuggestion(started.game, {
    suggesterId: "you",
    suspectId: "scarlet",
    weaponId: "wrench",
    roomId: "study",
    responses: [{ playerId: "jack", type: "show", cardId: "scarlet" }],
  });
  assert.equal(added.ok, false);
  assert.match(added.error, /can't have Miss Scarlet/);
  assert.equal(started.game.suggestions.length, 0);
});

test("you cannot pass when one of the three cards is in your hand", () => {
  const started = articleGame(0);
  const added = tryAddSuggestion(started.game, {
    suggesterId: "jack",
    suspectId: "plum",
    weaponId: "candlestick",
    roomId: "kitchen",
    responses: [
      { playerId: "dana", type: "pass" },
      { playerId: "karen", type: "pass" },
      { playerId: "you", type: "pass" },
    ],
  });
  assert.equal(added.ok, false);
  assert.match(added.error, /Kitchen/);
});

test("an already satisfied show does not force the other two cards", () => {
  const started = articleGame(2);
  const added = tryAddSuggestion(started.game, {
    suggesterId: "jack",
    suspectId: "mustard",
    weaponId: "revolver",
    roomId: "library",
    responses: [
      { playerId: "dana", type: "pass" },
      { playerId: "karen", type: "show", cardId: null },
    ],
  });
  assert.equal(added.ok, true, added.error);
  const sheet = analyze(added.game);
  assert.equal(sheet.owners.library.playerId, "karen");
  assert.equal(sheet.owners.revolver, undefined);
  assert.equal(sheet.owners.mustard, undefined);
  assert.equal(sheet.marks.karen.revolver, undefined);
  assert.equal(sheet.marks.karen.mustard, undefined);
});

test("one open slot that must cover two guesses pins the shared card", () => {
  let game = articleGame(0).game;
  for (const cardId of ["mustard", "ballroom", "knife"]) {
    const category = engine.CARD_MAP[cardId].category;
    const added = tryAddSuggestion(game, {
      suggesterId: "you",
      suspectId: category === "suspects" ? cardId : "plum",
      weaponId: category === "weapons" ? cardId : "wrench",
      roomId: category === "rooms" ? cardId : "study",
      responses: [
        { playerId: "jack", type: "pass" },
        { playerId: "dana", type: "pass" },
        { playerId: "karen", type: "show", cardId },
      ],
    });
    assert.equal(added.ok, true, added.error);
    game = added.game;
  }
  const first = tryAddSuggestion(game, {
    suggesterId: "jack",
    suspectId: "plum",
    weaponId: "candlestick",
    roomId: "library",
    responses: [
      { playerId: "dana", type: "pass" },
      { playerId: "karen", type: "show", cardId: null },
    ],
  });
  assert.equal(first.ok, true, first.error);
  game = first.game;
  const second = tryAddSuggestion(game, {
    suggesterId: "dana",
    suspectId: "green",
    weaponId: "wrench",
    roomId: "library",
    responses: [{ playerId: "karen", type: "show", cardId: null }],
  });
  assert.equal(second.ok, true, second.error);
  const sheet = analyze(second.game);
  assert.equal(sheet.contradictions.length, 0);
  assert.equal(sheet.owners.library.playerId, "karen");
  assert.deepEqual(sheet.marks.karen.library, [4, 5]);
  assert.ok(sheet.eliminated.karen.candlestick);
  assert.ok(sheet.eliminated.karen.wrench);
});

test("a card only one player can hold is theirs once that category's envelope is known", () => {
  const created = createGame({
    players: [
      { id: "you", name: "You", isYou: true },
      { id: "avery", name: "Avery", isYou: false },
      { id: "blair", name: "Blair", isYou: false },
    ],
    yourHand: ["scarlet", "mustard", "white", "green", "peacock", "rope"],
    publicCards: [],
  });
  const passed = tryAddSuggestion(created.game, {
    suggesterId: "you",
    suspectId: "plum",
    weaponId: "knife",
    roomId: "study",
    responses: [
      { playerId: "avery", type: "pass" },
      { playerId: "blair", type: "pass" },
    ],
  });
  assert.equal(passed.ok, true, passed.error);
  const showed = tryAddSuggestion(passed.game, {
    suggesterId: "avery",
    suspectId: "green",
    weaponId: "candlestick",
    roomId: "hall",
    responses: [
      { playerId: "blair", type: "pass" },
      { playerId: "you", type: "show", cardId: null },
    ],
  });
  assert.equal(showed.ok, true, showed.error);
  const sheet = analyze(showed.game);
  assert.equal(sheet.owners.knife.kind, "envelope");
  assert.equal(sheet.owners.candlestick.playerId, "avery");
  assert.equal(sheet.owners.hall.playerId, "avery");
});

test("two guesses leave both numbers on the shared card", () => {
  const started = articleGame(0);
  const first = tryAddSuggestion(started.game, {
    suggesterId: "jack",
    suspectId: "scarlet",
    weaponId: "candlestick",
    roomId: "library",
    responses: [
      { playerId: "dana", type: "pass" },
      { playerId: "karen", type: "show", cardId: null },
    ],
  });
  assert.equal(first.ok, true, first.error);
  const second = tryAddSuggestion(first.game, {
    suggesterId: "jack",
    suspectId: "plum",
    weaponId: "wrench",
    roomId: "library",
    responses: [
      { playerId: "dana", type: "pass" },
      { playerId: "karen", type: "show", cardId: null },
    ],
  });
  assert.equal(second.ok, true, second.error);
  const sheet = analyze(second.game);
  assert.deepEqual(sheet.marks.karen.library, [1, 2]);
  assert.deepEqual(sheet.marks.karen.candlestick, [1]);
  assert.deepEqual(sheet.marks.karen.wrench, [2]);
  assert.deepEqual(sheet.marks.karen.plum, [2]);
});

test("showable cards follow the current sheet", () => {
  const game = articleGame(1).game;
  const sheet = analyze(game);
  assert.deepEqual(cardsPlayerCouldShow(sheet, game, "karen", ["scarlet", "library", "candlestick"]), [
    "library",
    "candlestick",
  ]);
  assert.deepEqual(cardsPlayerCouldShow(sheet, game, "you", ["plum", "kitchen", "candlestick"]), ["kitchen"]);
});

test("the next ask is one unknown card plus two cards nobody else can show", () => {
  const ask = recommendAsk(articleGame(0).game);
  assert.equal(ask.focusId, "candlestick");
  assert.equal(ask.suspectId, "scarlet");
  assert.equal(ask.weaponId, "candlestick");
  assert.equal(ask.roomId, "kitchen");
  assert.equal(
    ask.reason,
    "You hold Miss Scarlet and the Kitchen. If someone shows a card, they have the Candlestick. If everyone passes, it's in the envelope."
  );
});

test("a numbered guess makes that card the one to ask about", () => {
  const ask = recommendAsk(articleGame(1).game);
  assert.equal(ask.focusId, "candlestick");
  assert.equal(ask.suspectId, "scarlet");
  assert.equal(ask.roomId, "kitchen");
  assert.match(ask.reason, /settles Karen's guess 1/);
});

test("once only one player can hold the open card, the ask names them", () => {
  const ask = recommendAsk(articleGame(2).game);
  assert.equal(ask.focusId, "candlestick");
  assert.equal(ask.suspectId, "scarlet");
  assert.equal(ask.roomId, "kitchen");
  assert.equal(
    ask.reason,
    "You hold Miss Scarlet and the Kitchen. Only Jack can still have the Candlestick. If Jack passes, it's in the envelope."
  );
});

test("a category with two cards left is the one to settle", () => {
  const created = createGame({
    players: [
      { id: "you", name: "You", isYou: true },
      { id: "avery", name: "Avery", isYou: false },
      { id: "blair", name: "Blair", isYou: false },
    ],
    yourHand: ["scarlet", "mustard", "white", "green", "rope", "kitchen"],
    publicCards: [],
  });
  const ask = recommendAsk(created.game);
  assert.equal(ask.focusId, "peacock");
  assert.equal(ask.weaponId, "rope");
  assert.equal(ask.roomId, "kitchen");
  assert.equal(
    ask.reason,
    "You hold the Rope and the Kitchen. If someone shows a card, they have Mrs. Peacock, and Professor Plum is in the envelope. If everyone passes, Mrs. Peacock is."
  );
});

test("a solved envelope has nothing left to ask", () => {
  const created = createGame({
    players: [
      { id: "you", name: "You", isYou: true },
      { id: "a", name: "Avery", isYou: false },
      { id: "b", name: "Blair", isYou: false },
    ],
    yourHand: ["scarlet", "mustard", "candlestick", "knife", "kitchen", "ballroom"],
    publicCards: [],
  });
  const added = tryAddSuggestion(created.game, {
    suggesterId: "you",
    suspectId: "plum",
    weaponId: "wrench",
    roomId: "study",
    responses: [
      { playerId: "a", type: "pass" },
      { playerId: "b", type: "pass" },
    ],
  });
  assert.equal(recommendAsk(added.game), null);
});

test("open cells carry each player's chance of holding the card", () => {
  const game = articleGame(0).game;
  const sheet = analyze(game);
  const chances = engine.holdChances(game, sheet);

  assert.ok(Math.abs(chances.jack.mustard - 4 / 15) < 1e-6);
  assert.ok(Math.abs(chances.dana.mustard - 4 / 15) < 1e-6);
  assert.ok(Math.abs(chances.karen.mustard - 4 / 15) < 1e-6);
  assert.ok(Math.abs(chances.jack.knife - 0.25) < 1e-6);
  assert.ok(Math.abs(chances.jack.library - 5 / 18) < 1e-6);
  assert.equal(chances.you.scarlet, 1);
  assert.equal(chances.you.library, 0);
  assert.equal(chances.jack.scarlet, 0);
  assert.equal(chances.jack.pipe, 0);
  const jackSum = engine.CARDS.reduce((sum, card) => sum + chances.jack[card.id], 0);
  assert.ok(Math.abs(jackSum - 4) < 1e-6);

  const midGame = articleGame(1);
  const mid = engine.holdChances(midGame.game, analyze(midGame.game));
  assert.equal(mid.dana.library, 0);
  assert.equal(mid.dana.candlestick, 0);
  assert.ok(mid.karen.library > mid.jack.library);
  assert.ok(mid.karen.candlestick > mid.jack.candlestick);
  assert.ok(mid.karen.library + mid.karen.candlestick >= 1 - 1e-6);
  const karenSum = engine.CARDS.reduce((sum, card) => sum + mid.karen[card.id], 0);
  assert.ok(Math.abs(karenSum - 4) < 1e-6);

  const known = engine.holdChances(articleGame(2).game, analyze(articleGame(2).game));
  assert.equal(known.karen.library, 1);
  assert.equal(known.jack.library, 0);
  assert.equal(known.dana.library, 0);
});

test("an uneven deal still splits each open card across players who could hold it", () => {
  const created = createGame({
    players: [
      { id: "you", name: "You", isYou: true },
      { id: "a", name: "Avery", isYou: false },
      { id: "b", name: "Blair", isYou: false },
    ],
    yourHand: ["scarlet", "rope", "kitchen"],
    publicCards: [],
  });
  const sheet = analyze(created.game);
  assert.equal(sheet.handSizeOk, false);
  const chances = engine.holdChances(created.game, sheet);
  assert.equal(chances.you.scarlet, 1);
  assert.equal(chances.a.scarlet, 0);
  assert.ok(Math.abs(chances.a.mustard - 0.4) < 1e-9);
  assert.ok(Math.abs(chances.b.mustard - 0.4) < 1e-9);
});

function ARTICLE_PLAYERS() {
  return engine.ARTICLE_SETUP.players.map((player) => ({ ...player }));
}
