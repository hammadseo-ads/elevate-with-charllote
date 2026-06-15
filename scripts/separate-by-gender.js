/**
 * Split all-people-except-quiz.csv into female / male / unknown CSVs by
 * classifying the first_name column against an embedded name dictionary.
 * Falls back to extracting a name guess from the email prefix when
 * first_name is empty or unrecognized.
 *
 * Usage:  node scripts/separate-by-gender.js
 * Input:  ./klaviyo-export/all-people-except-quiz.csv
 * Output: ./klaviyo-export/all-people-females.csv
 *         ./klaviyo-export/all-people-males.csv
 *         ./klaviyo-export/all-people-unknown-gender.csv
 *
 * Each output gets a `gender_source` column added so you know HOW each
 * profile was classified: "first_name", "email_prefix", or "" (unknown).
 *
 * The dictionary covers ~500 common female + ~500 common male first names
 * (Western + many international). Ambiguous names (Alex, Sam, Jordan, etc.)
 * are intentionally OMITTED — they go to unknown so you can decide.
 *
 * For tighter accuracy, add names to the FEMALE / MALE arrays below.
 */

const fs   = require("node:fs");
const path = require("node:path");

const IN_FILE    = path.join(__dirname, "..", "klaviyo-export", "all-people-except-quiz.csv");
const OUT_FEMALE = path.join(__dirname, "..", "klaviyo-export", "all-people-females.csv");
const OUT_MALE   = path.join(__dirname, "..", "klaviyo-export", "all-people-males.csv");
const OUT_UNK    = path.join(__dirname, "..", "klaviyo-export", "all-people-unknown-gender.csv");

/* ---------- Name dictionaries (lowercase, no diacritics) ---------- */

const FEMALE = new Set([
  // Top 300 US/UK female names
  "mary","patricia","jennifer","linda","elizabeth","barbara","susan","jessica","sarah","karen",
  "lisa","nancy","betty","margaret","sandra","ashley","kimberly","emily","donna","michelle",
  "carol","amanda","melissa","deborah","stephanie","dorothy","rebecca","sharon","laura","cynthia",
  "amy","kathleen","angela","shirley","brenda","emma","anna","pamela","nicole","samantha",
  "katherine","christine","helen","debra","rachel","carolyn","janet","catherine","maria","heather",
  "diane","olivia","julie","joyce","victoria","ruth","virginia","lauren","kelly","christina",
  "joan","evelyn","judith","andrea","hannah","megan","cheryl","jacqueline","martha","madison",
  "teresa","gloria","sara","janice","ann","kathryn","abigail","sophia","frances","jean",
  "alice","judy","isabella","julia","grace","amber","denise","danielle","marilyn","beverly",
  "charlotte","natalie","theresa","diana","brittany","doris","kayla","alexis","lori","marie",
  "tiffany","jane","carla","crystal","tina","wendy","alison","aria","ava","mia",
  "amelia","harper","evelyn","ella","luna","sofia","avery","mila","scarlett","penelope",
  "layla","chloe","eleanor","nora","riley","zoey","hazel","lily","ellie","violet",
  "lillian","zoe","stella","aurora","emilia","everly","leah","audrey","claire","savannah",
  "brooklyn","bella","paisley","lucy","allison","ivy","eliana","gabriella","kennedy","maya",
  "willow","kinsley","naomi","aaliyah","elena","sadie","hailey","kaylee","ariana","valentina",
  "brielle","peyton","autumn","melanie","alyssa","ariella","jasmine","julianna","sydney","brooke",
  "alexandra","mackenzie","vivian","eva","ariel","isabelle","sophie","rebekah","aisha","gemma",
  "esther","fatima","francesca","gabrielle","georgia","gianna","hailey","hayley","heidi","holly",
  "imani","ingrid","irene","isabel","ivory","jacqueline","jada","jaime","jamie","janelle",
  "jasmine","jayla","jenna","jenny","jocelyn","josephine","joy","kaitlyn","kaitlin","kara",
  "karina","kate","kathy","kelsey","khloe","kira","kirsten","krista","kristen","kristin",
  "kylie","lana","lara","leila","leslie","liana","lila","lilian","liliana","lindsey",
  "lindsay","lola","lorraine","lourdes","lucia","lydia","mackenzie","mackenzie","madeline","madelyn",
  "maeve","mara","marcia","marcy","margot","mariah","mariana","marianne","marissa","martina",
  "mason","matilda","maureen","may","mei","melinda","mercedes","meredith","miranda","mira",
  "miriam","molly","mona","monica","muriel","nadia","nadine","nala","nicola","nikki",
  "nina","noelle","nora","norah","ophelia","paige","patrice","pearl","phoebe","poppy",
  "priscilla","rachel","raquel","raven","rebecca","reese","regina","renata","renee","reyna",
  "rhea","rhiannon","rita","rivka","roberta","rochelle","rosalind","rosalie","rose","rosemary",
  "rowan","roxanne","rubi","ruby","sabrina","sage","salma","sally","sandra","saoirse",
  "sasha","selena","selina","serena","shannon","shauna","sheila","sierra","silvia","skylar",
  "sloane","sonia","sonya","stacey","stacy","sue","summer","suzanne","suzy","sylvia",
  "talia","tamara","tania","tanya","tara","tatiana","tessa","thea","theresa","tiana",
  "tracy","trinity","tyra","ursula","valerie","vanessa","veronica","vicky","vienna","viola",
  "wanda","whitney","winifred","winnie","xiomara","yara","yasmin","yolanda","yvette","yvonne",
  "zara","zelda","zora","alicia","alma","alondra","amaya","ana","angelina","angie",
  "anita","arielle","ashlyn","beatrix","becca","betsy","brenda","brigitte","bridget","camille",
  "candice","cara","carmen","caroline","cassidy","celia","celine","clara","colette","constance",
  "corinne","courtney","daniella","daphne","darlene","dawn","delilah","delia","desiree","destiny",
  "edith","elaine","elise","eliza","ellen","eloise","elsa","elise","elyse","emery",
  "esme","estelle","ethel","faith","fern","fiona","florence","frieda","gail","genevieve",
  "ginger","gina","glenda","greta","gretchen","gwendolyn","gwen","halle","hallie","harley",
  "hattie","haven","heidi","helene","henrietta","hilda","hilary","hillary","ines","iris",
  "isadora","isla","jacinta","jada","jaime","jamila","janelle","janine","jasmin","jenny",
  // International / less common but still gendered
  "fatma","aisha","ayesha","aishah","khadija","mariam","zahra","hira","ayşe","ayse",
  "sumi","akari","yui","sakura","hina","emi","mio","aya","mei","rin",
  "anastasia","ekaterina","tatiana","svetlana","valeriya","mariya","olga","irina","yulia","liubov",
  "priya","kavya","aditi","ananya","ishaan","aisha","fatima","mehek","mahek","ayesha",
  "valentina","alejandra","ximena","gabriela","catalina","mariana","camila","daniela","fernanda","paola",
  "agnes","brigitta","ingrid","kerstin","margareta","carina","britta","frida","linnea","saga",
  "ailbhe","aoife","caoimhe","ciara","eilidh","fionnuala","grainne","maeve","niamh","saoirse",
  "rachel","sarah","leah","rivka","esther","miriam","ariella","yael","tamar","shira",
  "anouk","fleur","saskia","willemijn","romi","jolijn","femke","emmie","janneke","eline",
  "charllote", // intentional typo coverage seen in your data
  /* Common short forms / nicknames + names found in actual data */
  "katie","katy","kati","kit","kate","kathy","kathie","katrina","kat",
  "erin","ellie","liz","lizzie","lizzy","beth","bess","bethany",
  "jess","jessie","jessy","jessika","jenny","jen","jenna","jennie","jeni",
  "louise","louisa","lou","paula","claudia","natasha","tasha",
  "steph","stephie","jo","joanne","joanna","jade","erika","erica","kirsty","kirsten",
  "rachael","tracey","tracy","maggie","mags","hanna","hanne","hannelore",
  "anne","annie","carolina","caroline","carrie","carry","robyn",
  "natalia","marina","lina","linnea","lea","jodie","jody","chelsea",
  "michele","michelle","michaela","mikaela","marta","marda",
  "johanna","georgina","georgie","cristina","clare","cindy","cynthia",
  "abby","abbie","tori","mel","melinda","meg","megan","megs",
  "karolina","karla","caitlin","caitlyn","bianca","becky","becca",
  "magdalena","maddy","maddie","leanne","kayleigh","kayla",
  "holly","shannon","toni","nicki","niki","toya","joelle","jolie",
  "saskia","franziska","greta","brigitta","ingrid","kerstin","ulrike","gertrude",
  "amelie","amélie","aurélie","aurelie","celine","céline","manon","margaux","clémence","clemence",
  "elise","eloise","heloise","héloïse","camille","cecile","cécile","colette","delphine","diane",
  "carla","ines","inês","isabel","leonor","mariana","matilde","beatriz","sofia",
  "yulia","liubov","ksenia","kseniya","nastya","oksana","ulyana","masha",
  "shreya","priya","kavya","aditi","ananya","kavitha","deepika","sneha","pooja","komal",
  "ishika","mehek","mahek","krithika","divya","meera","preethi","rashmi","sangeetha",
  "nina","liv","sigrid","helga","astrid","yui","aki","megumi","nanami","sayuri",
  "valentina","camilla","cami","gaby","gabby","gabi","gabriela","gabby",
  "joanne","jolie","kelsie","kelsi","krystal","kristyn","kristine","kris","gina","ginger",
  "renee","renée","rae","raylene","raylee","raylee","robynn","ronnie","rachael",
  "selene","seraphina","serafina","seraphine","sherry","sheri","summer","sunny",
  "tabitha","tara","teri","terri","terrie","tessa","tia","tonia","tonya","tracee",
  "valerie","vera","verna","viola","vivian","vivien","wendi","wendy","whitney","willa",
  "yasmine","yelena","zaria","zara","alex","alexa","alexia","alexa","aleksandra",
  "alana","alani","alexandria","amal","amaya","amelia","amelie","ana","anastasia",
  "andie","andrea","aneta","angeles","anita","aria","ariel","arianna","arielle","arwen",
  "asha","ashleigh","ashleigh","ashley","aubree","aubrey","ayesha","aida","aida",
  "babs","barb","barbie","becki","beckie","belinda","bernie","betsy","bev","beverley",
  "bonnie","brianne","brielle","brittney","camilla","candy","cassie","cathy","celine",
  "chana","char","cherie","cherry","chiquita","christa","christen","christi","cathie",
  "cici","cleo","constance","cori","corie","corinne","dakota","daria","darleen","darla",
  "deanna","debby","debi","dee","dedra","delia","della","desiree","didi","dina","dinah",
  "dolly","dolores","dolly","donatella","dora","doris","drew","edie","effie","eilish",
  "eleanora","eliana","eliza","elke","ellis","elly","elna","elspeth","elvira","emerald",
  "emma","emmy","ena","ester","ethel","etta","faith","fanny","farrah","fawn","faye",
  "fern","fiona","flora","florrie","fran","francie","fred","gabriella","gail","gerda",
  "ginger","ginny","greta","gussie","gwen","gwyneth","halle","hallie","heloise","henrietta",
  "hettie","hillary","ida","ines","ingrid","ione","isobel","jana","jane","janie","janna",
  "jeanne","jeannette","jeannie","jenelle","jeneva","jess","jessika","jett","jewel","jill",
  "jillian","jocelyn","joelle","joey","joni","joyce","julianne","julianna","junie","kacey",
  "kaden","kandace","kandi","kandy","kara","karina","kasey","kat","katarina","katlyn",
  "kayla","keeley","keely","kelli","kellie","kelsey","keri","kerri","kerrie","kerry",
  "khloe","kiera","kimber","kimberley","kimmie","kira","kirby","kirsty","kiya","kris",
  "krissy","kristen","kristi","kristie","kristin","krystal","kyla","kylee","kylie","laila",
  "lana","laney","lani","lara","larissa","leila","lena","lenore","lesley","leticia",
  "lia","liana","libby","liesel","liesl","lila","lillie","lily","lina","linda","lindy",
  "lisa","loretta","lori","lou","lourdes","lovell","lucia","lula","lulu","luz",
  "lyla","lynda","lynette","lynn","lynne","mae","maeve","mara","marci","marcia","marg",
  "marge","margie","margot","mari","maria","marian","marianne","maribel","mariel","marion",
  "marisa","marisol","marjorie","marlene","marlo","marsha","marta","marya","matilda","maud",
  "maureen","mavis","maya","mckenna","melba","melinda","mercedes","meri","meryl","mia",
  "michaela","mickey","midge","milly","mimi","mina","mindy","minnie","missy","misty","mitzi",
  "mollie","molly","mona","myra","myrtle","nadine","nancy","nanette","naomi","natalia","nellie",
  "nell","nettie","nikki","nina","ninetta","ninette","nita","noelle","nora","norah","norma",
  "nyla","ola","olive","opal","ora","paige","pam","pammy","patti","patty","pauline","peg",
  "peggy","penny","perla","petra","phyllis","pia","polly","portia","prudence","queenie",
  "rachael","raven","reba","regina","reina","rena","renate","renee","rhonda","rikki","riley",
  "rita","ritta","roberta","roni","ronnie","rori","rory","rosalie","rosalind","rosanna",
  "rosanne","roseanne","rosemarie","rosetta","rosie","rosy","rowena","roxana","roxanne","roxie",
  "roxy","ruby","ruth","ruthie","sabine","sabrina","sallie","sally","salma","sandi","sandie",
  "sandy","sara","sarai","sasha","selma","shana","shari","sharon","shauna","shay","shea",
  "sheena","sheila","sheri","sherri","sherrie","sherry","sheryl","shirl","shona","sibyl","sissy",
  "sondra","sonia","sonja","sophia","sophie","stacey","staci","stacie","stacy","steffi","stella",
  "stevie","sue","susan","susie","suzanne","suzette","suzie","sybil","sylvia","tamara","tameka",
  "tami","tammy","tanya","tara","tasha","teri","terri","terrie","tessa","thea","thelma","theresa",
  "thora","tia","tiffanie","tiffany","tina","tisha","toni","tonia","tonya","traci","trina","trish",
  "trisha","trudy","ula","ursula","val","valencia","valeria","valerie","velma","venus","vera",
  "verna","veronica","vicki","vickie","vicky","viola","virginia","wanda","wendi","wendy","whitney",
  "wilhelmina","willa","willow","winifred","winnie","yasmine","yolanda","yvette","yvonne","zara",
  "zelda","zoe","zoey","zora","zsa", "leigh", "lala", "elin", "ines", "vera",
  /* Round 2 — names still seen in unknown bucket */
  "jackie","jacqui","jacqueline","freya","chantelle","chantal","carly","alina","tess","tessa",
  "nathalie","natalie","katelyn","katelynn","jenn","jenni","helena","haley","hailey","felicia",
  "adriana","veronika","tayla","simone","sian","reem","monique","meghan","malin","maja","majlinda",
  "kristy","kristi","kristine","kristina","kristyn","kay","karin","karen","isa","hope",
  "harriet","em","emmie","elisa","elise","debbie","debby","deb","daisy","cheyenne","brianna",
  "anja","amie","stefanie","stephanie","sofie","sophie","shelley","shelly","shelby","mandy",
  "dee","dani","danni","danielle","dani","ev","eva","evi","gabby","greta","gemma","ginny",
  "hayley","haylee","ivy","janie","janna","jenelle","jenni","jenny","jessamy","jeri","kara",
  "karli","karly","kasey","kaye","keisha","kelli","kellie","kendall","kenya","keri","kerryn",
  "leigh","leslie","levana","liesel","lilly","linsey","liv","livi","liza","loretta","lou","lulu",
  "luna","macy","mae","maelle","maelys","margaux","mariella","marisol","marlena","marlene","marnie",
  "marsha","martina","melanie","melinda","melissa","melodie","melody","merry","mette","milena","milla",
  "mira","miriam","mitzi","monika","monique","nadia","nadya","nancie","nessa","nia","niamh","nina",
  "noor","oksana","paloma","pamela","peggy","penelope","peony","phyllida","piper","quincy","raina",
  "raven","raye","rayna","reba","reece","regina","reta","rhonda","rocio","ronda","rosanna","roselyn",
  "roslyn","rowena","roxane","roxanne","ruby","ruth","sabina","saffron","sage","saira","salma","sandi",
  "sara","sarina","sasa","saskia","scarlet","scarlett","schyler","selena","selina","seraphina","serena",
  "shabnam","shaila","shana","shante","shari","sharon","shauna","shawna","shayla","shea","sheena",
  "shelagh","sherry","sheryl","shilpa","shona","shonda","sidney","sidonie","sienna","silvia","sinead",
  "siobhan","siri","sky","skyla","skye","skyler","sofija","solange","sondra","soraya","stacey","stacie",
  "stacy","stana","starla","stefani","stevie","susanna","susannah","suzanne","sybil","sydney","tabitha",
  "tahnee","talia","tameka","tamera","tamia","tamika","tammie","tammy","tanika","tanisha","tanya",
  "tasha","tatum","teri","terri","terrie","terry","tessa","thalia","thea","thelma","tiffany","tilda",
  "tilly","tina","tonia","tonya","tori","torri","tracey","tracy","trang","trina","trisha","trista",
  "trudy","una","valencia","valentina","valeria","valery","vanesa","vanessa","velma","venus","verena",
  "verna","veronika","vianney","vicki","vickie","vicky","viola","violet","violetta","virgina","viv",
  "viviana","vyolet","wanda","wendi","wendy","whitney","willa","wilma","winnie","yara","yasmeen",
  "yasmin","yelena","yesenia","yessica","yolanda","yvette","yvonne","zaida","zandra","zanele",
  "zelda","zenobia","zhenya","zinnia","zoey","zora","stine","line","trine","ulla","ute","yana",
  "kayleen","kaylene","brigitte","britt","brittny","brooklynn","cady","caitlyn","caitlin","camila",
  /* Round 3 */
  "madeleine","madeline","lorena","jeanette","ivana","felicity","eve","evie","colleen","saoirse",
  "elena","helena","helene","elise","amalia","amalfi","carlotta","carmela","celestine","clementine",
  "claudine","constance","corinne","corina","corinna","cosette","crystal","cyndi","dakota","damaris",
  "darlene","davinia","delphine","desiree","dianne","dolores","donatella","dora","dorothy","edna",
  "elga","elin","elke","elsa","ema","ember","emory","ena","enola","enya","eponine","esmeralda",
  "ester","etta","eulalia","eva","fae","fallon","fatima","fawn","fay","faye","felicia","fernanda",
  "filomena","flavia","flo","florence","francine","frieda","gail","genevieve","gilda","giselle",
  "grace","gracie","graciela","greer","gunilla","gunhild","hadley","halima","hana","hattie","haylie",
  "helga","henna","hettie","hilde","hilma","honor","hortense","ima","imani","imelda","imogen",
  "ina","indira","irma","isadora","isolde","jacinta","jaclyn","jana","janelle","janessa","janice",
  "janie","janine","janis","jeanine","jeanna","jenelle","jenell","jeniffer","jeraldine","jerelyn",
  "jeri","jerilyn","jerrica","jeryl","jessamine","jevon","jia","jin","jina","jocosta","jody",
  "joelle","johanna","jolene","jolie","jolyne","jonelle","jorja","josefina","joycelyn","josiane",
  "justine","kaia","kaira","kalani","kalyani","kameron","karen","karina","karyn","kasandra",
  "katarina","katelin","katelyn","kateryna","katey","kathlyn","kathy","kati","katie","kayanna",
  "kayleigh","kaylin","kayly","kazuko","keiko","keilani","keira","kellee","kelsea","kendra",
  "kennedi","kennedy","kennya","kenya","kerrigan","kesha","keshia","keturah","keziah","khadija",
  "khaleesi","khloe","kiara","kiera","kierra","kiki","kiley","kimba","kimberely","kimber","kimora",
  "kinsley","kira","kiran","kirsi","kishon","kit","kitty","kiya","krishna","krista","kristel",
  "kristelle","kristyn","krystle","ksenia","kya","kyla","kylee","laci","laina","lakeisha","lalita",
  "lana","lanae","laraine","laren","larissa","laryssa","latanya","latasha","latifah","latisha",
  "latonya","laurel","laurelle","laurena","laurene","laurenne","laurie","laurissa","lavender","laveta",
  "lavinia","laya","layah","layla","leann","leanna","leanne","leila","leilah","leilani","leisa",
  "lela","lenore","leonor","leonora","leslie","leticia","lexa","lexi","lexie","leyla","lila",
  "liliana","lilianne","lilibeth","lillie","lily","liliya","lina","linda","linnea","linsey",
  "linsay","lisa","lisbeth","lise","liselotte","lisette","liv","liza","lizbeth","lizeth","lizzy",
  "lola","lolita","lonna","lora","lorelai","lorelei","lorena","loretta","loris","lorna","lottie",
  "lou","louanne","louisa","louise","lourdes","luana","lucetta","luciana","lucie","lucienne","lucila",
  "lucile","lucille","ludmila","lula","lulu","luna","lupe","luz","lydia","lyla","lynda","lyndsey",
  "lyric","mabel","macey","maddison","madelyn","madison","madonna","mae","maeve","mafalda","magdalene",
  "maggie","maia","maja","makayla","makenna","makenzi","makenzie","malaika","malee","mali","malina",
  "malinda","malka","mallory","mara","marabella","marcella","marcelle","marcia","margarita","margaux",
  "margery","margherita","margo","margot","mariah","mariama","mariana","marianne","maribel","maricela",
  "mariela","marilena","marilou","marina","marinda","marisha","marisol","marissa","marita","marjorie",
  "marketa","markie","marla","marlena","marlene","marlie","marlow","marnie","marpessa","marquita",
  "marsha","marta","martha","martina","martine","marvella","mary","maryam","maryanne","maryjane",
  "mathilde","matilda","maude","maureen","maven","mavis","maxine","maya","mayra","mckayla",
  "mckenna","mckenzie","mckinley","meagan","meaghan","meena","meeya","megan","meghan","mehgan",
  "melania","melanie","melba","melinda","melisa","melissa","melodie","melody","melvina","mercedes",
  "merita","merle","merlene","merrideth","merritt","merry","mette","mia","miah","miakoda","mica",
  "michaela","michele","michelina","mika","mikaela","mikayla","mila","milagros","milana","milani",
  "milena","miley","millicent","millie","milly","mimi","mina","mindy","minerva","minnie","mira",
  "miracle","mireille","mirella","miriam","mirta","mishaela","missy","misti","misty","mitzi","mojan",
  "molly","monet","monica","monika","monisha","monique","montana","montserrat","mor","morag",
  "morena","moriah","morwen","muriel","mya","myra","myrna","myrtle","nadege","nadia","nadina","nadine",
  "naima","najwa","nakia","nala","nancy","naoko","narcisa","natalia","natascha","natasha","nathalia",
  "nathalie","nayeli","nazia","nazly","nedra","nell","nellie","nelly","nerissa","nessa","nevaeh",
  "nia","niamh","niccola","nichelle","nicki","nicola","nicole","nicolette","nikki","nikolina",
  "nila","nilda","nina","ninfa","ninja","nita","nivea","nizhoni","noa","noelia","noelle","nora",
  "norah","noreen","norma","nova","nya","nydia","nyla","nyssa","octavia","odelia","odessa","odette",
  "ofelia","ofila","oksana","olga","olivia","olympia","oona","ophelia","oprah","ora","orla","orna",
  "ottilie","page","paige","paloma","pam","pamala","pamela","pamella","paola","paris","pascale",
  "patience","patrice","patrina","patti","paula","paulette","paulina","pauline","peaches","pearl",
  "pearle","penelope","penny","perla","persephone","peyton","philippa","phoebe","phyllis","pia",
  "piedad","pilar","piper","pippa","polly","portia","precious","prima","primrose","priscilla","prudence",
  "queenie","queenie","quetzali","quinta","quintessa","rachael","racquel","raelene","raelynn","rainbow",
  "raisa","raissa","ramona","randi","raphaela","raquel","rashida","raven","rayanne","raylene","raylynn",
  "raynell","rayven","reba","rebeca","rebecca","rebekah","reese","regan","regena","regenia","regina",
  "renata","renate","renay","rene","renea","renee","renita","rennie","reta","retta","reva","reyna",
  "rhea","rhianna","rhianne","rhoda","rhonda","ria","rica","ricarda","rinda","risa","rita",
  "rivka","rocio","roma","romaine","romina","romina","rosa","rosabella","rosalia","rosalie","rosalina",
  "rosalind","rosalinda","rosamund","rosanne","roselyn","rosemarie","rosemary","rosenda","rosetta",
  "rosie","rosina","roslyn","rowena","roxane","roxanna","roxie","roxy","rubi","ruby","rubye","rufina",
  "ruth","ruthie","sabina","sabra","sabrina","sade","sadie","sadia","saffron","sage","saira","salena",
  "salina","sally","salma","samantha","samara","samia","sandra","sandrine","sandy","santina","saoirse",
  "sapna","sara","sarah","sarai","saraya","saskia","savannah","scarlet","scarlett","seana","seanna",
  "sela","selena","selene","selina","selma","seraphima","seraphina","serena","serenity","shae","shaina",
  "shamika","shana","shaneka","shanell","shaniqua","shanika","shanna","shannan","shantel","shari",
  "sharlene","sharon","shaunda","shauna","shawnda","shawnna","shayla","shayna","shea","sheena","sheila",
  "shelba","shelia","shelley","shelly","sherita","sherley","sherri","sherrie","sherry","sheryl","shilah",
  "shilpa","shira","shirleen","shirley","shona","shonda","shontel","shoshana","shyla","sienna","sigrid",
  "silvia","simone","simonne","sina","sindi","sirena","siri","sissy","sky","skyla","skylar","skylynn",
  "skyler","sloan","sloane","sneha","sofia","sofie","soledad","solveig","sondra","sonia","sonja","sonya",
  "sophie","sophy","soraya","stacey","staci","stacie","stacy","star","starla","stefani","stefania",
  "stefanie","stefany","stella","steph","stephania","stephani","stephanie","stephany","steph","sue",
  "summer","sunita","sunny","susan","susana","susanne","susannah","susanna","susie","sutton","suzanna",
  "suzette","suzy","svetlana","sybil","sydnee","sydney","sylvia","sylvie","syreeta","tabatha","tabby",
  "tabitha","tahirah","taima","tajia","talia","talisha","talitha","tally","tamala","tamar","tamara",
  "tameka","tamera","tamesha","tami","tamia","tamiko","tamika","tammi","tammy","tamra","tana",
  "tania","tanika","tanisha","tanya","tara","taren","tasha","tashia","tatiana","tatum","tawana",
  "tawanda","tawanna","tawny","tayla","tayler","taylor","tea","teagan","tecla","teena","tehillah",
  "tehya","teigan","teneka","teresa","terese","teresita","teri","terri","terrie","terry","tess",
  "tessie","thalia","thea","thelma","theodora","theresa","therese","thomasina","tia","tiana","tianna",
  "tiara","tiffaney","tiffani","tiffanie","tiffany","tilly","tina","tisha","tomasa","toni","tonia",
  "tonita","tonja","tonya","topaz","tori","toya","tracee","trang","trella","trena","tressa","tricia",
  "trina","trinette","trinity","trish","trisha","trista","tristen","trudi","trudy","tula","tyesha",
  "tyisha","tyree","tyree","ula","ulla","una","ute","valarie","valencia","valene","valentina","valeria",
  "valerie","valery","vanesa","vanessa","velia","velma","velvet","venessa","venus","vera","verda",
  "verena","verla","verlene","verna","vernice","vernita","verona","veronica","veronika","vesta","vicki",
  "vickie","vicky","victoria","vida","vienna","viki","vilma","vina","vincenza","violet","violeta",
  "violetta","virginia","viridiana","virtue","viva","vivian","viviana","vonda","wendi","wendy","whitney",
  "wilda","wilfreda","wilhelmina","willa","willene","willow","wilma","winifred","winona","winsome",
  "wynne","wynter","xandra","xena","ximena","xiomara","xochitl","yadira","yaffa","yamilet","yamileth",
  "yana","yara","yareli","yasmin","yasmine","yelena","yesenia","yessenia","yetta","yolanda","yoshie",
  "yoshiko","ysabel","yumi","yuriko","yvette","yvonne","zada","zaida","zaira","zandra","zaria","zelda",
  "zella","zenobia","zenobie","zenia","zillah","zinnia","zita","zoe","zoey","zofia","zola","zora",
  "zoraida","zsofia","zsuzsi",
]);

const MALE = new Set([
  // Top 300 US/UK male names
  "james","robert","john","michael","william","david","richard","joseph","thomas","charles",
  "christopher","daniel","matthew","anthony","mark","donald","steven","paul","andrew","joshua",
  "kenneth","kevin","brian","george","edward","ronald","timothy","jason","jeffrey","ryan",
  "jacob","gary","nicholas","eric","jonathan","stephen","larry","justin","scott","brandon",
  "benjamin","samuel","gregory","frank","alexander","raymond","patrick","jack","dennis","jerry",
  "tyler","aaron","henry","douglas","peter","jose","adam","nathan","zachary","walter",
  "kyle","harold","carl","arthur","gerald","roger","keith","jeremy","lawrence","sean",
  "christian","albert","wayne","ralph","roy","eugene","louis","philip","bobby","austin",
  "noah","liam","mason","elijah","logan","lucas","ethan","sebastian","oliver","alexander",
  "owen","gabriel","carter","jayden","julian","wyatt","luke","grayson","leo","jaxon",
  "asher","levi","lincoln","hudson","ezra","ezekiel","theo","theodore","oscar","caleb",
  "isaac","mateo","cooper","jameson","colton","easton","brody","silas","jaxson","kayden",
  "jose","jordan","cameron","evan","tristan","blake","damian","santiago","dominic","beau",
  "axel","weston","abraham","emmett","king","brayden","jude","atlas","august","bennett",
  "everett","graham","kingston","preston","wesley","lorenzo","cole","king","abram","amir",
  "miles","jensen","kai","wesley","brooks","reid","emery","atlas","arlo","khalil",
  "moses","leon","beckett","nolan","callum","caspian","jasper","mahmoud","mohammed","muhammad",
  "ahmed","ali","hassan","omar","yusuf","ibrahim","khalid","abdullah","tariq","rashid",
  "abdul","fahim","faisal","hamza","imran","jamal","kamal","majid","nasser","raza",
  "raj","arjun","aarav","vivaan","aditya","krishna","rohan","sai","reyansh","ayaan",
  "vihaan","ishaan","shaurya","atharva","kabir","arnav","aryan","dhruv","kunal","manish",
  "carlos","diego","luis","miguel","rafael","alejandro","javier","jorge","manuel","fernando",
  "francisco","ricardo","oscar","sergio","eduardo","martin","mario","alberto","raul","cesar",
  "guillermo","arturo","emilio","felipe","gabriel","gerardo","gustavo","hector","horacio","ivan",
  "antoine","baptiste","clément","clement","damien","emile","etienne","fabien","florian","gauthier",
  "guillaume","hugo","jérôme","jerome","julien","laurent","marc","mathieu","maxime","nicolas",
  "pascal","pierre","quentin","romain","sébastien","sebastien","stéphane","thierry","vincent","yann",
  "andrea","alessandro","marco","matteo","luca","francesco","giovanni","giuseppe","stefano","fabio",
  "yuki","hiroshi","kenji","takeshi","ryo","kazuki","haruto","sora","yuto","ren",
  "minjun","seojun","jisoo","jihoon","minho","sungho","junseo","dohyun","hyunwoo","taeyang",
  "lev","artem","dmitry","dmitri","ivan","sergey","nikolai","alexei","mikhail","vladimir",
  "boris","yuri","oleg","pavel","viktor","andrei","anton","ilya","kirill","maxim",
  "ahmad","reza","amir","arash","babak","behzad","dariush","ehsan","farhad","hossein",
  "kasper","mads","oskar","henrik","lars","erik","gustav","nils","jens","stefan",
  "lorenzo","matteo","leonardo","alessio","tommaso","gabriele","emanuele","riccardo","federico","davide",
  "klaus","hans","franz","heinrich","fritz","gerhard","helmut","otto","rudolf","walter",
  "kwame","kojo","kofi","kwesi","yaw","akwasi","kenya","jelani","tendai","tafara",
  /* Common short forms / nicknames + names found in actual data */
  "tom","tommy","chris","christo","chrisy","ben","benji","benny","bennie","joe","joey",
  "matt","matty","ian","tim","timmy","steve","stevie","mike","mikey","josh","dave","davey","davy",
  "dan","danny","andy","andre","simon","craig","alan","rob","robbie","robby","neil","lee","pete","petey",
  "jeff","geoff","jefferson","jeffrey","darren","nick","nicky","jon","jonny","jonnie","will","willie","willy",
  "tony","mac","mack","ronny","ronnie","ronald","ron","mark","marc","marky",
  "alfie","archie","arlo","barney","bertie","bobby","brad","bradley","brett","brett",
  "buck","bud","buddy","caleb","carlos","carter","casey","cedric","clark","clayton","cliff",
  "clinton","clive","cody","colin","colt","conor","connor","cornelius","corey","cory","cosmo",
  "curt","curtis","cyrus","damon","darryl","dean","deano","del","derek","derick","dirk",
  "dominic","dominik","don","donny","douglas","doug","drake","dustin","dwight","earl","eddie",
  "eddy","edmund","elias","elliot","elliott","ellis","elvis","emmett","ernie","ernst","erwin",
  "ewan","felix","ferdinand","finn","finnegan","fletcher","floyd","ford","frankie","fraser",
  "fred","freddie","freddy","gareth","garth","gary","gavin","gene","gerald","gilbert","glen",
  "glenn","gordon","graeme","grant","greg","gregg","greggory","gunther","hamish","hans","harvey",
  "hayden","heath","herbert","herman","hugh","hugo","ike","irvin","irving","isaac","isaiah",
  "jake","jamie","jared","jarvis","jasper","jay","jeb","jed","jerome","jerry","jess","jesse",
  "jett","jim","jimmy","jodie","john","johnnie","johnny","jose","josh","jude","julian","junior",
  "kade","kai","kameron","keanu","keaton","keenan","keith","kelvin","ken","kennedy","kenny",
  "kent","kim","kit","klaus","kurt","kyle","lance","lars","laurence","leland","len","lenny",
  "leo","leon","leonard","leroy","les","levi","lewis","lex","liam","lincoln","linus","lionel",
  "lloyd","logan","loren","lorenzo","louie","louis","lucas","lukas","luke","lyle","lyndon",
  "magnus","malcolm","malik","manny","marco","marcus","mario","marlon","marshall","martin",
  "marty","marvin","mason","mathias","mauricio","max","maxim","maxwell","mel","melvin","mervyn",
  "milo","mitch","mitchell","monte","monty","moses","murphy","murray","myron","nasir","nate",
  "nathaniel","ned","nelson","neville","newt","niall","nigel","noah","noel","norman","odin",
  "olaf","ollie","omar","ori","orlando","orson","oscar","otis","ozzy","pablo","paddy","pat",
  "patrick","paulo","pax","perry","phil","philip","phillip","pierce","quentin","quincy","quinn",
  "rafael","rafe","ralph","ramon","ramsey","randall","randy","rashad","ray","raymundo","reece",
  "reggie","reginald","reid","rene","rex","rhys","ricky","riley","robin","rocco","rocky","roger",
  "roland","rolf","rolando","ross","rowan","roy","ruben","rudy","rufus","rusty","rylan","said",
  "salvador","sammy","sasha","saul","sawyer","scott","seamus","sergio","seth","seymour","shane",
  "shaun","shawn","sherman","sid","sidney","silas","sly","sonny","spencer","stan","stanley","stewart",
  "stuart","sully","syd","ted","teddy","terence","terrance","terrell","terrence","terry","theo",
  "tiago","tito","tobias","toby","todd","tomas","torsten","tracy","travis","trent","trenton",
  "trevor","trey","tristan","troy","tucker","ty","tyler","tyrone","ulrich","ulises","val",
  "vance","vaughn","vern","vernon","victor","vincent","vinny","virgil","wade","walt","walter",
  "warren","wayne","wendell","wes","wesley","whitley","wilbert","wilbur","wilfred","willis",
  "wilson","winston","wyatt","yannick","yves","zach","zachariah","zak","zane",
  /* Round 2 — names still seen in unknown bucket */
  "harry","juan","brendan","rick","ricky","bob","bobby","ed","eddie","rich","richie","richard",
  "leon","lenny","len","greg","glen","glenn","frank","frankie","ernest","ernie","emil","emilio",
  "elijah","edwin","earl","cyril","conor","connor","cody","clinton","clive","clay","clarence","clark",
  "chris","christof","christoph","christophe","cliff","clifford","clyde","colby","cole","clinton",
  "conrad","cooper","cosmo","craig","curtis","cyrus","damien","damon","dante","darius","darren",
  "darryl","derrick","desmond","dexter","diego","dimitri","dion","dirk","dwight","eduardo","efrain",
  "elliot","elliott","ellis","ely","emanuel","emil","emilio","emmanuel","enrique","ephraim","ernesto",
  "ervin","ezekiel","fabian","felipe","felix","fernando","finbar","finn","fitz","flavio","florian",
  "francisco","franco","fredrik","freddy","gary","gennaro","geoffrey","geraldo","gianni","gilbert",
  "gilles","giorgio","giuseppe","gordon","gus","gustavo","guy","habib","hakim","hamilton","hans",
  "haroun","harris","harrison","hashim","hayden","heath","heinrich","henrik","henrique","henry","herbert",
  "herman","hideo","hiroshi","horace","horacio","hudson","hugh","hugo","humphrey","hunter","ibrahim",
  "ignacio","igor","inigo","irvin","irving","isaac","isaiah","ismael","ivan","jack","jacky","jagger",
  "jair","jakob","jamal","jameson","jared","jarrod","javier","jay","jaylen","jed","jeff","jefferson",
  "jensen","jerald","jericho","jeremiah","jeremy","jermaine","jerome","jerrell","jerrod","jess","jesus",
  "jett","jim","jimmy","joachim","joao","joaquin","jody","joe","joel","joey","john","jojo","jose",
  "josh","jovan","juanito","jules","julius","jurgen","kade","kadeem","kai","kaiden","kaleb","kameron",
  "karim","karl","karsten","kasen","kasey","kasper","keagan","keanu","keaton","keegan","keith","kellen",
  "kelvin","kendall","kendrick","kennith","kerry","kerwin","kevin","khalid","khalif","kiaan","kian",
  "kiefer","kieran","kim","kimball","king","kingston","kip","kirk","klaus","knox","kobe","koda","kody",
  "kohen","konrad","korey","kris","krishan","kristian","kristoff","kristopher","kurt","kwame","kye",
  "kyler","lance","landon","lane","lars","laszlo","laurance","laurence","lawson","leandro","lee",
  "leif","leland","leonardo","leonel","leopold","leroy","levi","lewis","liam","ligon","lincoln","lindon",
  "lionel","loic","logan","loic","lonnie","loren","lorenzo","loris","louie","louis","luc","lucca",
  "lucian","ludwig","luigi","lukas","luke","luther","lyle","lyndon","lynn","mac","mackenzie","mael",
  "magnus","mahdi","makai","mal","malachi","malachy","malik","manfred","manny","marcellus","marcello",
  "marcelo","marcin","marcio","marco","marcos","marcus","mario","marius","marko","markus","marlon",
  "marquez","marshall","martin","marty","mason","massimo","massimiliano","mateo","mathew","mathias",
  "mathieu","matias","matthias","mauricio","maurizio","mauro","max","maxime","maximiliano","maximilian",
  "maximo","maxwell","maynard","mayson","melvin","mervin","micah","miguel","mikel","mikhail","miles",
  "milos","milton","misha","mitchell","mohamed","mohammad","mohammed","monte","monty","moshe","murphy",
  "murray","myron","nash","nasser","nathaniel","nelson","nestor","nico","nicolai","nigel","nikhil",
  "niko","nikola","nikolai","nikolas","nikolay","nils","noah","noam","noe","noel","nolan","norbert",
  "norman","norris","oakley","obadiah","octavio","oden","odin","olaf","oliver","ollie","omari","oren",
  "orion","orlando","orson","oscar","osman","osvaldo","oswald","otto","owen","pablo","paddy","pat",
  "patricio","patryk","pavel","pawel","percy","perry","peter","phil","phillipe","phineas","piers",
  "pierre","placido","prescott","priam","quentin","quincy","quinn","quintin","quinton","rafael","rafe",
  "ralph","ramiro","ramon","randell","randolph","randy","raoul","raphael","rashid","raul","ray","raylan",
  "raymundo","reagan","reece","reed","reese","reggie","reginald","reid","remy","renato","rene","reuben",
  "rex","reyes","reynaldo","rhett","rhys","ricardo","richie","rick","rickey","ricky","ridge","rigoberto",
  "ringo","rio","ripley","river","roan","rob","roberto","rocco","rocky","rodney","rodolfo","rodrigo",
  "roel","roger","roland","rolando","rolf","romeo","ronnie","roosevelt","rory","ross","roy","royce",
  "ruben","rudolph","rudy","rufus","rusty","ryker","sage","said","salman","salvador","salvatore","sam",
  "sami","sammie","sammy","samson","sander","santino","santo","saul","sawyer","scotty","sean","sebastian",
  "selim","serge","sergei","seth","seymour","shamir","shane","shaquille","shaun","shawn","shea","shelby",
  "sheldon","shem","sherman","shimon","sid","silas","simeon","sinclair","skip","skyler","sol","solomon",
  "stanford","stan","stanley","stefan","stefano","stelio","stellan","stephan","stephane","sterling",
  "stetson","stewart","stuart","sven","tad","tahir","talon","tamir","tarik","tariq","tate","tavish",
  "taye","taylor","ted","teddy","teo","terrance","terrell","terrence","tetsuro","theodor","theodore",
  "thiago","thomas","thurston","tiago","tiberius","tibor","timo","timothy","tito","toby","todd","tomas",
  "tomasz","toney","torin","torrance","trace","travis","trent","trenton","trevor","trey","tristan",
  "tristen","trond","troy","truman","tucker","tudor","tully","ty","tyler","tyrese","tyrone","tyson",
  "ulises","ulrich","umar","urban","uri","uriah","val","valentin","valentino","valter","van","vance",
  "vasco","vaughn","vernon","vicente","vidar","vincent","vinod","virgil","wade","walker","wallace",
  "walt","wendell","wes","wesley","whit","wilbur","wilfred","wilfredo","willem","willie","willy",
  "wilmer","winston","wolf","wolfgang","wyatt","xander","xavier","yannick","yannik","yannis","yaroslav",
  "yasin","yves","zach","zachary","zaheer","zaire","zayn","zayd","zeke","zion",
]);

/* Some names that are commonly unisex — intentionally NOT classified to either set.
   Profiles with these names go to the "unknown" file for manual review. */
const AMBIGUOUS = new Set([
  "alex","alexis","jordan","jamie","casey","taylor","morgan","cameron","riley","sam",
  "pat","robin","quinn","drew","dana","kelly","lee","kris","blake","jaden",
  "phoenix","sage","rowan","skyler","skylar","ash","kim","terry","tracy","reese",
]);

/* ---------- minimal CSV parser ---------- */
function parseRow(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === ',') { out.push(field); field = ""; }
      else if (c === '"') inQuotes = true;
      else field += c;
    }
  }
  out.push(field);
  return out;
}
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/* Normalize a name: lowercase, strip diacritics, take first word, strip non-letters. */
function normalize(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // remove diacritics
    .toLowerCase()
    .split(/[\s\-_.']+/)[0]                              // first word/segment
    .replace(/[^a-z]/g, "");                             // letters only
}

/* Pull a likely first name out of an email prefix (before @, before . or _ or +). */
function nameFromEmail(email) {
  if (!email || !email.includes("@")) return "";
  const prefix = email.split("@")[0];
  /* Common patterns: "mary.smith", "mary_smith", "marys", "mary+tag", "mary123" */
  const first = prefix.split(/[._+\-]/)[0];
  return normalize(first);
}

function classify(firstName, email) {
  /* 1) try the first_name column */
  const fn = normalize(firstName);
  if (fn && !AMBIGUOUS.has(fn)) {
    if (FEMALE.has(fn)) return { gender: "female", source: "first_name", guess: fn };
    if (MALE.has(fn))   return { gender: "male",   source: "first_name", guess: fn };
  }
  /* 2) fall back to email prefix */
  const en = nameFromEmail(email);
  if (en && !AMBIGUOUS.has(en)) {
    if (FEMALE.has(en)) return { gender: "female", source: "email_prefix", guess: en };
    if (MALE.has(en))   return { gender: "male",   source: "email_prefix", guess: en };
  }
  return { gender: "unknown", source: "", guess: fn || en || "" };
}

/* ---------- main ---------- */
(() => {
  if (!fs.existsSync(IN_FILE)) {
    throw new Error(`Missing ${IN_FILE}\nRun aggregate-lists.js first.`);
  }

  const raw = fs.readFileSync(IN_FILE, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l !== "");
  const headers = parseRow(lines[0]);
  const col = Object.fromEntries(headers.map((h, i) => [h, i]));

  /* Add two extra columns to each output: gender_source + name_guess. */
  const outHeaders = [...headers, "gender_source", "name_guess"];

  const buckets = { female: [], male: [], unknown: [] };
  const counts  = { female: 0, male: 0, unknown: 0, by_first_name: 0, by_email: 0 };

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    const firstName = row[col.first_name] || "";
    const email     = row[col.email]      || "";
    const { gender, source, guess } = classify(firstName, email);

    counts[gender]++;
    if (source === "first_name")   counts.by_first_name++;
    if (source === "email_prefix") counts.by_email++;

    /* Append the two diagnostic columns. */
    const outRow = [...row, source, guess].map(csv).join(",");
    buckets[gender].push(outRow);
  }

  function write(filepath, rows) {
    fs.writeFileSync(filepath, [outHeaders.join(","), ...rows].join("\n") + "\n", "utf8");
  }
  write(OUT_FEMALE, buckets.female);
  write(OUT_MALE,   buckets.male);
  write(OUT_UNK,    buckets.unknown);

  const total = counts.female + counts.male + counts.unknown;
  const pct   = (n) => ((n / total) * 100).toFixed(1) + "%";
  console.log(`Input:    ${total.toLocaleString()} profiles from all-people-except-quiz.csv`);
  console.log("");
  console.log(`Female:   ${counts.female.toLocaleString().padStart(7)} (${pct(counts.female)})  → all-people-females.csv`);
  console.log(`Male:     ${counts.male.toLocaleString().padStart(7)} (${pct(counts.male)})  → all-people-males.csv`);
  console.log(`Unknown:  ${counts.unknown.toLocaleString().padStart(7)} (${pct(counts.unknown)})  → all-people-unknown-gender.csv`);
  console.log("");
  console.log(`Classified by first_name:   ${counts.by_first_name.toLocaleString()}`);
  console.log(`Classified by email prefix: ${counts.by_email.toLocaleString()}`);
})();
