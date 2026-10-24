/**
 * Brand images. Everything is self-hosted from /public — nothing loads from the old panzutti.com site.
 * Menu photos live in /public/menu/<slug>.webp (see `localMenuImage` in lib/data.ts).
 * The character poses come from the Panzutti mascot sheet (D:\work\Panzutti_Mascots), trimmed and
 * converted to webp in /public/mascots.
 */

export const MASCOTS = {
  classic: { src: "/brand/character.webp", w: 525, h: 900 }, // the original cut-out (points with his raised hand)
  presenting: { src: "/mascots/presenting.webp", w: 545, h: 900 }, // colour, open hand presenting to the side
  forkKnife: { src: "/mascots/fork-knife.webp", w: 819, h: 900 }, // colour, fork & knife, licking his lips
  panuozzoWalk: { src: "/mascots/panuozzo-walk.webp", w: 687, h: 900 }, // cream tint, carrying a giant panuozzo
  panuozzoLove: { src: "/mascots/panuozzo-love.webp", w: 701, h: 900 },
  panuozzoExcited: { src: "/mascots/panuozzo-excited.webp", w: 688, h: 900 },
  panuozzoGreeting: { src: "/mascots/panuozzo-greeting.webp", w: 900, h: 884 },
  panuozzoEnjoy: { src: "/mascots/panuozzo-enjoy.webp", w: 705, h: 900 },
  welcome: { src: "/mascots/welcome.webp", w: 419, h: 900 }, // waving
  guide: { src: "/mascots/guide.webp", w: 479, h: 900 }, // pointing to the side
  confirm: { src: "/mascots/confirm.webp", w: 409, h: 900 }, // thumbs up
  engage: { src: "/mascots/engage.webp", w: 900, h: 740 }, // sitting on steps, eating
  discover: { src: "/mascots/discover.webp", w: 292, h: 900 }, // thinking, hand on chin
  walking: { src: "/mascots/walking.webp", w: 491, h: 900 },
  sitting: { src: "/mascots/sitting.webp", w: 846, h: 900 }, // colour, relaxing on a chair
  welcoming: { src: "/mascots/welcoming.webp", w: 825, h: 900 }, // half body, open arm
  hungry: { src: "/mascots/hungry.webp", w: 804, h: 900 },
  proud: { src: "/mascots/proud.webp", w: 661, h: 900 },
  curious: { src: "/mascots/curious.webp", w: 741, h: 900 },
  thankYou: { src: "/mascots/thank-you.webp", w: 672, h: 900 }, // colour portrait, eyes closed
  stickerHappy: { src: "/mascots/sticker-happy.webp", w: 658, h: 743 },
  stickerHungry: { src: "/mascots/sticker-hungry.webp", w: 645, h: 754 },
  stickerCheeky: { src: "/mascots/sticker-cheeky.webp", w: 655, h: 736 },
  stickerExcited: { src: "/mascots/sticker-excited.webp", w: 653, h: 745 },
  stickerSatisfied: { src: "/mascots/sticker-satisfied.webp", w: 630, h: 732 },
  stickerLove: { src: "/mascots/sticker-love.webp", w: 701, h: 900 },
  stickerEnjoy: { src: "/mascots/sticker-enjoy.webp", w: 717, h: 900 },
} as const;

export type MascotPose = keyof typeof MASCOTS;

/** Poses that point/look towards the viewer's right. Every other pose points left. Used to mirror him towards the content in EN and AR. */
export const FACES_RIGHT: ReadonlySet<MascotPose> = new Set<MascotPose>(["presenting", "guide", "welcome", "panuozzoGreeting", "panuozzoExcited"]);

export const brand = {
  mascot: MASCOTS.classic.src,
  photos: {
    hero: "/menu/hot-honey-pepperoni.webp", // signature panuozzo
    story: "/menu/the-comfort.webp", // polaroid in the story section
  },
  socials: {
    instagram: "https://www.instagram.com/panzuttiegypt",
    tiktok: "https://www.tiktok.com/@panzuttiegypt",
    facebook: "https://www.facebook.com/panzuttiegypt",
  },
  email: "info@panzutti.com",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Meraki+Complex+Air+Force+House+El+Golf+Salah+Salem+Cairo",
};
