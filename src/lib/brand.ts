/**
 * Brand images. For now these load from the current panzutti.com site.
 * To self-host: download each file into /public/brand and /public/photos
 * and change the paths here to "/brand/logo-red.png" etc. — nothing else changes.
 */
const SITE = "https://panzutti.com";

export const brand = {
  logoRed: `${SITE}/brand/logo-red.png`,
  logoCream: `${SITE}/brand/logo-cream.png`,
  mascot: "/brand/character.webp", // the Panzutti character (transparent cut-out of public/brand/character-welcome.jpg)
  photos: {
    hero: `${SITE}/photos/m-212.jpg`, // cheese-pull panuozzo
    oven: `${SITE}/photos/m-39.jpg`, // wood-fired oven
    story: `${SITE}/photos/m-211.jpg`, // "Authentic Italian, Egyptian heart"
  },
  socials: {
    instagram: "https://www.instagram.com/panzuttiegypt",
    tiktok: "https://www.tiktok.com/@panzuttiegypt",
    facebook: "https://www.facebook.com/panzuttiegypt",
  },
  email: "info@panzutti.com",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Meraki+Complex+Air+Force+House+El+Golf+Salah+Salem+Cairo",
};
