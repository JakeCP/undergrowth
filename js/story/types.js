// The shapes of the story (opening-act spec, "The scene system"). A
// scene is data: when it fires, who says what, and what it gives. The
// scenes themselves are in data/story/; js/story/story.js decides which
// are due. Pure: no DOM.

/** @typedef {import('../engine/types.js').Pos} Pos */
/**
 * When a scene fires. `map`, `shop`, `before` (a level chosen, before
 * deploying), `won` and `lost` are outside a battle; the rest are in one.
 * @typedef {'map'|'shop'|'before'|'start'|'firstSelect'|'denMarked'|'denDamaged'|'bandWiped'|'bandFreed'|'botDestroyed'|'lastBotDestroyed'|'turn'|'won'|'lost'} When
 */
/**
 * Something on screen a line points at. `den` is the den in the moment's
 * `at`; `band` is the head of the player's band of that type.
 * @typedef {{kind:'tile', at: Pos}|{kind:'band', type: string}|{kind:'den'}|{kind:'ui', id:'endTurn'|'undo'}} Pointer
 */
/**
 * The moods the portraits come in (scripts/portraits.mjs knows the same
 * seven). `scared` was drawn after the spec listed the first four;
 * `shrewd` and `greedy` were drawn for Hazel's shop, and a line may use
 * them too.
 * @typedef {'happy'|'surprised'|'sad'|'angry'|'scared'|'shrewd'|'greedy'} Mood
 */
/**
 * One line. `who` is a band type id, `hazel` (the shopkeeper) or
 * `narrator`. A mood shows that portrait (`fox-surprised`), or the
 * ordinary one where it has not been drawn. The fox and the hedgehog may
 * have any mood; anyone else only a mood whose portrait ships
 * (tests/story-data.test.mjs).
 * @typedef {{who: string, text: string, mood?: Mood, point?: Pointer}} Line
 */
/**
 * What a scene gives, whether it is watched or skipped. A `band` the
 * player already owns becomes a `recruit`; a `recruit` at the band's
 * largest size becomes 10 seeds.
 * @typedef {{kind:'band', type: string}|{kind:'recruit', type: string}|{kind:'seeds', amount: number}} Gift
 */
/**
 * Conditions on the save: bands owned or not, scenes seen or not. Every
 * list must hold in full.
 * @typedef {{owns?: string[], lacks?: string[], seen?: string[], unseen?: string[]}} Cond
 */
/**
 * A scene. With no `level` it fires on any level; with no `turn`, on any
 * turn. It is seen once unless `repeat` is true.
 * @typedef {{id: string, when: When, level?: string, turn?: number, if?: Cond, repeat?: boolean, lines: Line[], gives?: Gift[]}} Scene
 */
/**
 * A moment the game reaches. `turn` is set on a `turn` moment, `at` on
 * moments that happen somewhere (the den for `denMarked`).
 * @typedef {{when: When, level?: string, turn?: number, at?: Pos}} Moment
 */
/**
 * A save as the story reads it: any progress, with the scenes seen. A
 * save with no `story` has seen nothing.
 * @typedef {import('../engine/types.js').Progress & {story?: {seen: Record<string, boolean>}}} StoryProgress
 */

export {};
