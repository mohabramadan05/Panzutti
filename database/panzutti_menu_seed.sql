-- =====================================================================
-- Panzutti — full menu from "PANZUTTI Profile" (menu & concept PDF)
--
-- * Items, names and descriptions: the PDF. Arabic names/descriptions: added.
-- * Prices: the PDF has none, so they come from the live panzutti.com/en/menu
--   (2026-10-24). Stored in piasters (EGP × 100).
-- * Safe to run again: upserts by slug. Existing items keep their id (so carts,
--   orders and photos stay linked) and keep their is_signature /
--   suggest_at_checkout / image_url / is_sold_out settings.
-- * Drinks that are only on the website (hot drinks, iced tea, frappe,
--   smoothies, refreshers) are NOT in the PDF and are not added here.
-- =====================================================================

BEGIN;

WITH src (cat, slug, name_en, name_ar, description_en, description_ar, egp, sort_order, is_signature, suggest) AS (
  VALUES
  -- ---------------------------------------------------------------- Side Bites (appetizers)
  ('side-bites', 'fried-truffle-buffalo-balls', 'Fried Truffle Buffalo Balls', 'كرات جبنة بافلو مقلية بالترافل',
   '5 fried buffalo cheese balls with truffle mayo, parmesan cheese and parsley.',
   '٥ كرات جبنة بافلو مقلية مع مايونيز الترافل والبارميزان والبقدونس.', 145, 1, true, true),
  ('side-bites', 'rustic-wedges', 'Rustic Wedges', 'ودجز ريستيك',
   'Fried potato wedges with rosemary oil, garlic parmesan sauce and parmesan.',
   'بطاطس ودجز مقلية بزيت الروزماري وصوص الجارليك بارميزان والبارميزان.', 119, 2, false, true),
  ('side-bites', 'sausage-arancini-balls', 'Sausage Arancini Balls', 'أرانشيني بالسجق',
   '3 fried arancini balls stuffed with sausage, with parmesan and marinara sauce.',
   '٣ كرات أرانشيني مقلية محشية سجق، مع بارميزان وصوص مارينارا.', 159, 3, false, false),
  ('side-bites', 'chicken-arancini-balls', 'Chicken Arancini Balls', 'أرانشيني بالفراخ',
   '3 fried arancini balls stuffed with chicken, with parmesan and marinara sauce.',
   '٣ كرات أرانشيني مقلية محشية فراخ، مع بارميزان وصوص مارينارا.', 139, 4, false, false),
  ('side-bites', 'shrimp-arancini-balls', 'Shrimp Arancini Balls', 'أرانشيني بالجمبري',
   '3 fried arancini balls stuffed with shrimp, with parmesan and marinara sauce.',
   '٣ كرات أرانشيني مقلية محشية جمبري، مع بارميزان وصوص مارينارا.', 179, 5, false, false),
  ('side-bites', 'chicken-rolls', 'Chicken Rolls', 'تشيكن رولز',
   '2 fried chicken rolls with bacon and mixed cheese, served with marinara sauce.',
   '٢ رول فراخ مقلي بالبيكون وتشكيلة أجبان، مع صوص مارينارا.', 215, 6, false, false),
  ('side-bites', 'chips', 'Chips', 'بطاطس مقلية',
   'Classic salted fried chips with ketchup.',
   'بطاطس مقلية مملحة مع كاتشب.', 79, 7, false, true),

  -- ---------------------------------------------------------------- Fresh Sides (salads)
  ('fresh-sides', 'original-caprese', 'Original Caprese', 'كابريزي أوريجينال',
   'Rocca, cherry tomatoes, baby buffalo mozzarella, basil, pesto and balsamic glaze.',
   'جرجير، طماطم شيري، موتزاريلا بافلو، ريحان، بيستو وبلسميك جليز.', 240, 1, false, false),
  ('fresh-sides', 'arugula-lemon-shrimp', 'Arugula Lemon Shrimp', 'جرجير بالليمون والجمبري',
   'Rocca, grilled shrimp, sun-dried tomatoes, shaved parmesan and lemon dressing.',
   'جرجير، جمبري مشوي، طماطم مجففة، بارميزان ودريسنج ليمون.', 260, 2, false, false),
  ('fresh-sides', 'peach-bliss', 'Peach Bliss', 'بيتش بليس',
   'Whole burrata, peaches, rocca, cherry tomatoes and bresaola with our special dressing and balsamic glaze.',
   'بوراتا كاملة، خوخ، جرجير، طماطم شيري وبريزاولا مع الدريسنج الخاص وبلسميك جليز.', 340, 3, true, false),
  ('fresh-sides', 'classic-caesar', 'Classic Caesar', 'سيزر كلاسيك',
   'Batavia lettuce, grilled chicken, parmesan, croutons, Caesar dressing and lemon zest.',
   'خس باتافيا، فراخ مشوية، بارميزان، كروتون، صوص سيزر وبرش ليمون.', 210, 4, false, false),

  -- ---------------------------------------------------------------- Morning Mood (breakfast panuozzo)
  ('morning-mood', 'capri', 'Capri', 'كابري',
   'A freshly made sourdough panuozzo with creamy buffalo mozzarella, ripe tomatoes, fresh basil, pesto and balsamic glaze.',
   'بانوتزو بالعجينة المخمّرة مع موتزاريلا بافلو، طماطم، ريحان طازة، بيستو وبلسميك جليز.', 195, 1, true, false),
  ('morning-mood', 'easy-morning', 'Easy Morning', 'إيزي مورنينج',
   'Soft creamy scrambled eggs, parmesan and fresh rocca tucked inside our freshly made sourdough panuozzo.',
   'بيض مخفوق كريمي، بارميزان وجرجير طازة في بانوتزو بالعجينة المخمّرة.', 159, 2, false, false),
  ('morning-mood', 'the-comfort', 'The Comfort', 'ذا كومفورت',
   'A golden fried sourdough panuozzo filled with rich marinara, fresh mozzarella, basil and parmesan, served with a classic salad or crispy fried chips.',
   'بانوتزو مقلي ذهبي محشي صوص مارينارا، موتزاريلا طازة، ريحان وبارميزان، ويتقدم مع سلطة أو بطاطس مقلية.', 179, 3, false, false),
  ('morning-mood', 'fresh-and-smoked', 'Fresh and Smoked', 'فريش آند سموكد',
   'Premium smoked salmon, cream cheese, rocca, pickled onions and capers in a freshly made sourdough panuozzo.',
   'سلمون مدخن، كريم تشيز، جرجير، بصل مخلل وكبر في بانوتزو بالعجينة المخمّرة.', 379, 4, false, false),
  ('morning-mood', 'deli-delights', 'Deli Delights', 'ديلي ديلايتس',
   'Silky burrata, smoked turkey, delicate bresaola and crisp lettuce, finished with a drizzle of balsamic glaze.',
   'بوراتا، تيركي مدخن، بريزاولا وخس، مع لمسة بلسميك جليز.', 329, 5, false, false),
  ('morning-mood', 'everyday-routine', 'Everyday Routine', 'إفري داي روتين',
   'Smoked turkey, lettuce, cheddar and sun-dried tomatoes, finished with our rich garlic parmesan sauce.',
   'تيركي مدخن، خس، شيدر وطماطم مجففة مع صوص الجارليك بارميزان.', 225, 6, false, false),
  ('morning-mood', 'caramelized-beef', 'Caramelized Beef', 'كراميلايزد بيف',
   'Premium roast beef, slow-caramelized onions, fresh rocca and tangy pickles with a creamy pepper mayo.',
   'روست بيف، بصل مكرمل، جرجير ومخلل مع مايونيز الفلفل.', 219, 7, false, false),
  ('morning-mood', 'the-local', 'The Local', 'ذا لوكال',
   'An Egyptian-inspired filling: crispy ta’ameya with creamy tahini, rocca, tomatoes and pickles, served with fried chips on the side.',
   'طعمية مقرمشة بالطحينة والجرجير والطماطم والمخلل، وتتقدم مع بطاطس مقلية.', 159, 8, false, false),
  ('morning-mood', 'marinara-shakshouka', 'Marinara Shakshouka', 'شكشوكة مارينارا',
   'Creamy shakshouka-style scrambled eggs, rich marinara, parmesan and rocca in our freshly made sourdough panuozzo.',
   'بيض على طريقة الشكشوكة مع صوص مارينارا، بارميزان وجرجير في بانوتزو بالعجينة المخمّرة.', 159, 9, false, false),

  -- ---------------------------------------------------------------- All Day Panuozzo (lunch: chicken, beef, shrimp)
  ('all-day-panuozzo', 'chicken-cream-alfredo', 'Chicken Cream Alfredo', 'تشيكن كريم ألفريدو',
   'Grilled chicken breast, fresh rocca and parmesan with a creamy alfredo mushroom sauce in a freshly made sourdough panuozzo.',
   'صدور فراخ مشوية، جرجير وبارميزان مع صوص ألفريدو بالمشروم في بانوتزو بالعجينة المخمّرة.', 250, 1, false, false),
  ('all-day-panuozzo', 'caesar-club', 'Caesar Club', 'سيزر كلوب',
   'Inspired by the timeless Caesar salad: grilled chicken breast, lettuce, parmesan and rich Caesar dressing.',
   'مستوحى من سلطة السيزر: فراخ مشوية، خس، بارميزان وصوص سيزر.', 245, 2, false, false),
  ('all-day-panuozzo', 'golden-chicken-parm', 'Golden Chicken Parm', 'جولدن تشيكن بارم',
   'Crispy fried sourdough panuozzo with marinara and gooey melted mozzarella, golden fried chicken breast, rocca, basil and parmesan.',
   'بانوتزو مقلي مقرمش بالمارينارا والموتزاريلا السايحة، فراخ مقلية ذهبية، جرجير، ريحان وبارميزان.', 275, 3, false, false),
  ('all-day-panuozzo', 'grilled-chicken-pesto', 'Grilled Chicken Pesto', 'فراخ مشوية بالبيستو',
   'Grilled chicken breast, sun-dried tomatoes, parmesan and creamy pesto mayo.',
   'فراخ مشوية، طماطم مجففة، بارميزان ومايونيز البيستو.', 265, 4, false, false),
  ('all-day-panuozzo', 'hot-honey-pepperoni', 'Hot Honey Pepperoni', 'هوت هوني بيبروني',
   'Loaded with mozzarella and pepperoni, grilled to crispy perfection and finished with our signature hot honey sauce.',
   'محشي موتزاريلا وبيبروني، متحمص لحد ما يقرمش ومتزود بصوص الهوت هوني.', 205, 5, true, false),
  ('all-day-panuozzo', 'truffle-state', 'Truffle State', 'ترافل ستيت',
   'Smashed beef patties, sautéed mushrooms, cheddar, caramelized onions, parmesan and our rich truffle mayo.',
   'برجر بيف سماشد، مشروم سوتيه، شيدر، بصل مكرمل، بارميزان ومايونيز الترافل.', 340, 6, false, false),
  ('all-day-panuozzo', 'philly-sausage', 'Philly Sausage', 'فيلي سوسيدج',
   'Sausage, mushrooms, colored bell peppers, caramelized onions and cheddar, finished with our signature smoked sauce.',
   'سجق، مشروم، فلفل ألوان، بصل مكرمل وشيدر مع الصوص المدخن.', 275, 7, false, false),
  ('all-day-panuozzo', 'brisket-sesame', 'Brisket Sesame', 'بريسكت سيسامي',
   'Tender brisket, crisp Asian slaw, rich gravy and pepper mayo, finished with our smoky sauce and roasted sesame.',
   'بريسكت طري، سلو آسيوي، جريفي ومايونيز الفلفل مع الصوص المدخن والسمسم المحمص.', 340, 8, false, false),
  ('all-day-panuozzo', 'shrimp-luxe', 'Shrimp Luxe', 'شريمب لوكس',
   'Golden crispy shrimp coated in bold dynamite sauce with fresh lettuce.',
   'جمبري مقرمش بصوص الديناميت مع خس طازة.', 360, 9, false, false),
  ('all-day-panuozzo', 'shrimp-and-zest', 'Shrimp & Zest', 'شريمب آند زست',
   'Grilled shrimp with a zesty lemon dill sauce, fresh rocca and shaved parmesan.',
   'جمبري مشوي مع صوص الليمون والشبت، جرجير وبارميزان.', 360, 10, false, false),

  -- ---------------------------------------------------------------- Sweet Panuozzo & More (desserts)
  ('sweet-panuozzo', 'nutella-panuozzo', 'Nutella Panuozzo', 'بانوتزو نوتيلا',
   'An irresistible, freshly made cocoa-dough panuozzo filled generously with creamy Nutella.',
   'بانوتزو بعجينة الكاكاو محشي نوتيلا كريمي.', 185, 1, true, true),
  ('sweet-panuozzo', 'chocolate-temptation', 'Chocolate Temptation', 'تشوكليت تمبتيشن',
   'Original panuozzo dough filled with mascarpone and melted marshmallow, topped with Nutella and crushed hazelnuts.',
   'عجينة بانوتزو محشية ماسكاربوني ومارشميلو سايح، ومتغطية نوتيلا وبندق مجروش.', 270, 2, false, true),
  ('sweet-panuozzo', 'iconic-tiramisu', 'Iconic Tiramisu', 'تيراميسو',
   'The dessert everyone agrees on: rich mascarpone cream, coffee-soaked lady fingers and a cocoa powder finish.',
   'الحلو اللي الكل متفق عليه: كريمة ماسكاربوني، ليدي فينجرز بالقهوة وبودرة كاكاو.', 295, 3, false, true),

  -- ---------------------------------------------------------------- Signatures (signature mojitos)
  ('signatures', 'fizz-craft', 'Fizz Craft', 'فيز كرافت',
   'Mixed berries meet peach in a sparkling citrus refresher.',
   'توت مشكل وخوخ في مشروب حمضيات فوار.', 175, 1, true, true),
  ('signatures', 'fizzy-delight', 'Fizzy Delight', 'فيزي ديلايت',
   'Blueberry, mint and fizz — simple, fresh and uplifting.',
   'بلوبيري ونعناع وصودا — بسيط ومنعش.', 175, 2, false, true),
  ('signatures', 'power-plus', 'Power Plus', 'باور بلس',
   'Hibiscus, mint and citrus with a sparkling energy kick.',
   'كركديه ونعناع وحمضيات مع طاقة فوارة.', 165, 3, false, true),
  ('signatures', 'white-energy', 'White Energy', 'وايت إنرجي',
   'Strawberry and passion fruit boosted with White Coconut Red Bull.',
   'فراولة وباشن فروت مع ريد بول وايت كوكونت.', 195, 4, false, true),
  ('signatures', 'passion-fruit', 'Passion Fruit', 'باشن فروت',
   'An exotic tropical cooler with passion fruit, mint and citrus.',
   'مشروب استوائي بالباشن فروت والنعناع والحمضيات.', 165, 5, false, true),
  ('signatures', 'kiwi-chiller', 'Kiwi Chiller', 'كيوي تشيلر',
   'Fresh kiwi and mint blended into the ultimate refreshing chill.',
   'كيوي طازة ونعناع في أبرد مشروب منعش.', 175, 6, false, true)
)
INSERT INTO public.menu_items
  (category_id, slug, name_en, name_ar, description_en, description_ar, price, sort_order, is_signature, suggest_at_checkout)
SELECT c.id, s.slug, s.name_en, s.name_ar, s.description_en, s.description_ar, s.egp * 100, s.sort_order, s.is_signature, s.suggest
FROM src s
JOIN public.menu_categories c ON c.slug = s.cat
ON CONFLICT (slug) DO UPDATE SET
  category_id    = EXCLUDED.category_id,
  name_en        = EXCLUDED.name_en,
  name_ar        = EXCLUDED.name_ar,
  description_en = EXCLUDED.description_en,
  description_ar = EXCLUDED.description_ar,
  price          = EXCLUDED.price,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = now();
  -- is_signature, suggest_at_checkout, image_url, is_sold_out, is_active are left as the admin set them

-- Every All Day panuozzo can take "Extra sauce" (as on the live site's Sauces section)
INSERT INTO public.menu_item_addon_groups (menu_item_id, group_id, sort_order)
SELECT i.id, g.id, 10
FROM public.menu_items i
JOIN public.menu_categories c ON c.id = i.category_id AND c.slug = 'all-day-panuozzo'
CROSS JOIN (SELECT id FROM public.addon_groups WHERE name_en = 'Extra sauce' ORDER BY created_at LIMIT 1) g
ON CONFLICT (menu_item_id, group_id) DO NOTHING;



-- Check: SELECT c.slug, count(*) FROM menu_items i JOIN menu_categories c ON c.id = i.category_id GROUP BY 1 ORDER BY 1;

-- Photos from the live panzutti.com menu (Cloudinary), matched by name; only fills empty image_url
UPDATE public.menu_items i
SET image_url = v.url, updated_at = now()
FROM (VALUES
  ('Fried Truffle Buffalo Balls', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112206/panzutti/menu/Djdm5XM30k3CC4N5AYONL.webp'),
  ('Rustic Wedges', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1788961659/panzutti/menu/nBOBN5vZw9B_s7iRzLGgs.jpg'),
  ('Sausage Arancini Balls', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112274/panzutti/menu/IL67JNV1eZspPgQYQntTP.webp'),
  ('Chicken Arancini Balls', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784307195/panzutti/menu/kVabxLcTY370aVmiwNxaC.jpg'),
  ('Shrimp Arancini Balls', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1788250978/panzutti/menu/jaHifV46wRkFvy4EdT866.webp'),
  ('Chicken Rolls', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784132298/panzutti/menu/9FisvVwoamw_eocaNMEvJ.webp'),
  ('Chips', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1788250858/panzutti/menu/goFElf-8BPsDMFdwMEPJc.webp'),
  ('Original Caprese', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112656/panzutti/menu/J_vi2MhlWTgP4pUI0uYwf.webp'),
  ('Arugula Lemon Shrimp', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1788255345/panzutti/menu/qfwd_cm_dKCkuhShzfjrq.webp'),
  ('Peach Bliss', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1788254101/panzutti/menu/UvDa9wjHYGvOf7xTdF3HU.webp'),
  ('Classic Caesar', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1788253568/panzutti/menu/cpLDLRVR0AZTKWF-zW2S1.webp'),
  ('Capri', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784187501/panzutti/menu/ns5UgJukF36ACZoBm4G4R.webp'),
  ('Easy Morning', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112819/panzutti/menu/WqB2rH4t7DRm9kvqCypnU.webp'),
  ('The Comfort', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113179/panzutti/menu/yDPyC2Rsy9eWWIOrw6d3T.webp'),
  ('Fresh and Smoked', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112884/panzutti/menu/LQ9BnMifqFXrjGVa9VeyA.webp'),
  ('Deli Delights', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112967/panzutti/menu/JDuPzNCx4ibcl9Y_9YzWU.webp'),
  ('Everyday Routine', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113056/panzutti/menu/WNkVlOyBWAFKXG4Lzqx02.webp'),
  ('Caramelized Beef', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112021/panzutti/menu/Icezi3W9IKUgWqCkTeFkB.webp'),
  ('The Local', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784215777/panzutti/menu/YsMbbqLl8NJkBa3cQmHte.jpg'),
  ('Marinara Shakshouka', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113106/panzutti/menu/Bh_zDu0sJ8IwEYixS_v2Q.webp'),
  ('Chicken Cream Alfredo', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784112166/panzutti/menu/bY9F6pE8cY_u8RjorySmA.webp'),
  ('Caesar Club', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784189667/panzutti/menu/oHMaygl_0aLW5EZCKEVqh.webp'),
  ('Golden Chicken Parm.', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784187813/panzutti/menu/wXx9L8hDvoNxBRG0U75n3.webp'),
  ('Grilled Chicken Pesto', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784189976/panzutti/menu/MD6YQxC3g2MyFaxunmULs.webp'),
  ('Hot Honey Pepperoni', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113482/panzutti/menu/cjnN-7j5AUzV-yVSbYbi4.webp'),
  ('Truffle State', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784187846/panzutti/menu/Ls3Bpi2crPDDeNI89qrdx.webp'),
  ('Philly Sausage', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113535/panzutti/menu/P2Gwq5FwBVj6slNinsQVn.webp'),
  ('Shrimp Luxe', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784114500/panzutti/menu/mH2TUPlPWdu-YNRHYQOT5.webp'),
  ('Shrimp & Zest', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784187927/panzutti/menu/bJaGlW_rasTVGuUROPvsY.webp'),
  ('Nutella Panuozzo', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784458184/panzutti/menu/7d04sYCoj9OKi2cIii5HN.png'),
  ('Chocolate Temptation', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784457711/panzutti/menu/3culym2L-lS1dxfdHOBIG.jpg'),
  ('Iconic Tiramisu', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784114596/panzutti/menu/yFvCzaQW6uKEdIRY2oyEp.webp'),
  ('Fizz Craft', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113621/panzutti/menu/IOwCDCfA8rRXGjVi8L73p.webp'),
  ('Fizzy Delight', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113649/panzutti/menu/6Ai08VTMShFpsSLZF4oin.webp'),
  ('Power Plus', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113685/panzutti/menu/u_JwYrO6YbWd8bjacNvyt.webp'),
  ('White Energy', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113740/panzutti/menu/-uL-UbguuoGhg77pgmuNj.webp'),
  ('Passion Fruit', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113763/panzutti/menu/W1mnR3XXcG2xLs7IaAXPw.webp'),
  ('Kiwi Chiller', 'https://res.cloudinary.com/fwyx4bzm/image/upload/v1784113789/panzutti/menu/-PI6QAugF2JjbYpOSxAHs.webp')
) AS v(name, url)
WHERE i.image_url IS NULL
  AND regexp_replace(lower(i.name_en), '[^a-z0-9]', '', 'g') = regexp_replace(lower(v.name), '[^a-z0-9]', '', 'g');

COMMIT;
