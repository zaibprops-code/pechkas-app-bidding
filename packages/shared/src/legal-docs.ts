// Copied from zaibprops-code/Pechkas src/pages/app/*.astro (built) by scripts/copy-legal.mjs.
// Do not edit by hand: change the website's page, build it, then run that script.
import type { LegalDoc, LegalSlug } from './legal.ts';

/** The website commit these were copied from. */
export const LEGAL_FROM = "f635743";

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  "privacy": {
    "title": "Privacy policy",
    "lede": "What the app collects, who can see it, and how to have it deleted. For customers and for technicians.",
    "web": "https://pechkas.net/app/privacy",
    "blocks": [
      {
        "k": "meta",
        "c": [
          {
            "t": "Last updated: "
          },
          {
            "t": "[DATE YOU PUBLISHED THIS]",
            "ph": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "Who we are"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Pechkas connects people in Islamabad who need something repaired at home with technicians Pechkas has checked. This policy covers the Pechkas app on Android and iPhone. The website has its own policy at "
          },
          {
            "t": "/privacy",
            "href": "/privacy"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Registered name and address: "
          },
          {
            "t": "[REGISTERED BUSINESS NAME AND ADDRESS]",
            "mark": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "What the app collects, and why"
      },
      {
        "k": "h3",
        "text": "Everyone"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Your mobile number",
              "b": true
            },
            {
              "t": ", so the person you are working with can ring you. If you sign in with it, a code is sent to it by SMS. There is no password."
            }
          ],
          [
            {
              "t": "Your email address",
              "b": true
            },
            {
              "t": ", only if you choose to sign in with it instead: a code is emailed to you. You then type your mobile number yourself, and the Pechkas office can see that it has not been checked by SMS."
            }
          ],
          [
            {
              "t": "From your Google account",
              "b": true
            },
            {
              "t": ", only if you choose "
            },
            {
              "t": "Continue with Google",
              "i": true
            },
            {
              "t": "(on Android): Google tells us your email address, your name, the link to your Google profile picture, and a number for your Google account, so that the same Google account always opens the same Pechkas account. Your first name fills in the box on the welcome screen, and you can change it. The app never shows the picture. You then type your mobile number yourself, as with an email."
            }
          ],
          [
            {
              "t": "Your first name",
              "b": true
            },
            {
              "t": ", so the person you are dealing with knows whom to expect."
            }
          ],
          [
            {
              "t": "A code for your phone",
              "b": true
            },
            {
              "t": ", only if you allow notifications, so we can tell you about your job. It identifies the app on your phone, not you."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "Customers, when you post a job"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "What needs fixing: your words, and any voice note, video or photos you choose to add."
            }
          ],
          [
            {
              "t": "Where: the sector, street, house number, a landmark and any note for the gate."
            }
          ],
          [
            {
              "t": "Your exact location on a map, "
            },
            {
              "t": "only if you choose to add it",
              "b": true
            },
            {
              "t": ", to help the technician find the house."
            }
          ],
          [
            {
              "t": "When you want it done, and the price you offer."
            }
          ],
          [
            {
              "t": "If you ask for a technician who worked for you before, which technician you asked for."
            }
          ],
          [
            {
              "t": "If you block a technician after a job: that you did, and any reason you give. He is not told; only the Pechkas office sees it."
            }
          ],
          [
            {
              "t": "If Pechkas does not work in your sector yet and you tell us so in the app: which sector, and what kind of work you need. Nothing else is sent with it."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "Technicians"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Your full name, the work you do, your years of experience and the sectors you work in."
            }
          ],
          [
            {
              "t": "That Pechkas checked your identity, gave you a trial job and went through the rules with you: the date, who did it and how. "
            },
            {
              "t": "We never record a CNIC number or keep a copy of a CNIC.",
              "b": true
            }
          ],
          [
            {
              "t": "What you owe Pechkas and what you have paid, with the payment reference."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "During and after a job"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Each step and its time: on the way, arrived, started, done."
            }
          ],
          [
            {
              "t": "Photos the technician takes before and after, and of any shop receipt for parts."
            }
          ],
          [
            {
              "t": "Any new price asked at the door, with its reason and photo, and the answer."
            }
          ],
          [
            {
              "t": "Messages sent in the job's chat."
            }
          ],
          [
            {
              "t": "Ratings from 1 to 5 stars, and any words added."
            }
          ],
          [
            {
              "t": "Problems reported and guarantee claims."
            }
          ],
          [
            {
              "t": "If somebody presses the "
            },
            {
              "t": "emergency button",
              "b": true
            },
            {
              "t": ": that it was pressed, and where the phone was at that moment, if the phone allows it."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "Looking out for misuse"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "The office looks at patterns across jobs that can mean somebody is misusing the app: for example many jobs cancelled after a technician was chosen, many wrong start codes, or many jobs cancelled by one customer. It may write a note about what it found. "
          },
          {
            "t": "Nothing is decided automatically",
            "b": true
          },
          {
            "t": ": a person looks, and may ring you before deciding anything."
          }
        ]
      },
      {
        "k": "h3",
        "text": "What we do not collect"
      },
      {
        "k": "cross",
        "items": [
          [
            {
              "t": "Your contacts, your other apps, or your location in the background."
            }
          ],
          [
            {
              "t": "Card or bank details. The app takes no payments; customers pay the technician in cash."
            }
          ],
          [
            {
              "t": "Advertising identifiers. The app shows no adverts."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Who sees what"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Before a customer chooses a technician",
              "b": true
            },
            {
              "t": ", technicians who do that work in that sector see the sector, the customer's first name, the description, the voice note, video and photos, and the price offered. They do not see the street, the house number, the landmark, the map location or the phone number. If the customer asked for a technician who worked for them before, that technician alone sees the job for the first few minutes, then the others do."
            }
          ],
          [
            {
              "t": "Once chosen",
              "b": true
            },
            {
              "t": ", that one technician sees the address, the landmark, the gate note, the map location if one was added, and the customer's number, while the job is on. They leave his app when the job ends."
            }
          ],
          [
            {
              "t": "The customer",
              "b": true
            },
            {
              "t": " sees the technician's first name, years in the trade, his stars once he has enough ratings, and his number while the job is on."
            }
          ],
          [
            {
              "t": "Ratings",
              "b": true
            },
            {
              "t": " stay hidden from the other person until both have rated, or two days have passed. A technician's rating of a customer is seen only by Pechkas."
            }
          ],
          [
            {
              "t": "The Pechkas office",
              "b": true
            },
            {
              "t": " can see everything about a job, including its chat and photos, to run the service, handle complaints and keep everyone safe. Each person in the office has their own login."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Companies that handle the data for us"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "We do not sell your information, and nobody receives it for their own use. These companies store or carry it for us:"
          }
        ]
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Supabase",
              "b": true
            },
            {
              "t": " keeps the database, the photos and recordings, and the sign-in. Where it is stored: "
            },
            {
              "t": "[SUPABASE REGION]",
              "ph": true
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "Twilio",
              "b": true
            },
            {
              "t": " sends the sign-in code to your phone by SMS."
            }
          ],
          [
            {
              "t": "Resend",
              "b": true
            },
            {
              "t": " sends the sign-in code to your email, if you sign in with an email instead of a mobile number. It receives your email address and the code, nothing else."
            }
          ],
          [
            {
              "t": "Google",
              "b": true
            },
            {
              "t": " signs you in, if you choose Continue with Google. It sends Pechkas what is listed above, and it knows that you signed in to Pechkas."
            }
          ],
          [
            {
              "t": "Expo",
              "b": true
            },
            {
              "t": " carries notifications to your phone, through "
            },
            {
              "t": "Google (Firebase Cloud Messaging)",
              "b": true
            },
            {
              "t": " on Android and "
            },
            {
              "t": "Apple (Apple Push Notification service)",
              "b": true
            },
            {
              "t": " on iPhone. A notification says only the kind of work, the sector, a first name, a price and the job number — never an address or a phone number."
            }
          ],
          [
            {
              "t": "Google Maps",
              "b": true
            },
            {
              "t": " on Android and "
            },
            {
              "t": "Apple Maps",
              "b": true
            },
            {
              "t": " on iPhone draw the maps inside the app. To draw one they receive the area being shown: the place you pin, or where you are if you tap to show it. Pechkas itself keeps only a pin you choose to add to a job."
            }
          ]
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Calls and WhatsApp messages you make from the app go through your phone company and WhatsApp under their own terms."
          }
        ]
      },
      {
        "k": "h2",
        "text": "How long we keep it"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Your account and jobs are kept until you delete your account."
            }
          ],
          [
            {
              "t": "Deleting your account removes your profile, your jobs and their details, the voice notes, videos and photos you uploaded, your messages and ratings, any sector you told us about, any technicians you blocked, and any notes the office wrote about your account."
            }
          ],
          [
            {
              "t": "Kept after deletion:",
              "b": true
            },
            {
              "t": " the record of what a technician owed Pechkas and paid, which we keep for accounting. It holds the job number, the amounts and the technician's name, and nothing about the customer."
            }
          ],
          [
            {
              "t": "Photos a technician took at a customer's home are kept in Pechkas' private storage after the customer's account is deleted, where only the office can open them, and deleted within "
            },
            {
              "t": "[HOW LONG]",
              "ph": true
            },
            {
              "t": "."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Keeping it safe"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Everything travels encrypted. The database lets nobody read anything except through checks that decide exactly who may see which details, and the photos and recordings are in private storage, opened only through links that expire."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Your choices"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Delete your account",
              "b": true
            },
            {
              "t": " inside the app: open the menu, tap "
            },
            {
              "t": "Settings",
              "b": true
            },
            {
              "t": ", then "
            },
            {
              "t": "Delete my account",
              "b": true
            },
            {
              "t": ". Or ask us, as described at "
            },
            {
              "t": "/app/delete-account",
              "href": "/app/delete-account"
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "The camera, microphone, location and notifications are used only after you allow them, and you can switch any of them off in your phone's settings."
            }
          ],
          [
            {
              "t": "Ask us what we hold about you, or to correct it, using the details below."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Children"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "The app is for adults, 18 and over. We do not knowingly collect information from children."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Changes"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "If what the app collects changes, we change this page and the date at the top."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Getting in touch"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "WhatsApp us",
            "href": "https://wa.me/923358855076?text=About%20my%20information%20in%20the%20Pechkas%20app"
          },
          {
            "t": " or "
          },
          {
            "t": "call 0335 8855076",
            "href": "tel:+923358855076"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "review",
        "paras": [
          [
            {
              "t": "[REVIEW WITH A LAWYER BEFORE PUBLISHING]",
              "mark": true
            }
          ],
          [
            {
              "t": "A plain-language draft written to match what the app does. It is not legal advice. Before the app is public, have a lawyer read it against Pakistani law, fill in the bracketed gaps, and then remove this box."
            }
          ]
        ]
      }
    ]
  },
  "terms": {
    "title": "Terms of use",
    "lede": "How the app works for a customer, what you can expect from Pechkas and from the technician, and what we expect of you.",
    "web": "https://pechkas.net/app/terms",
    "blocks": [
      {
        "k": "meta",
        "c": [
          {
            "t": "Last updated: "
          },
          {
            "t": "[DATE YOU PUBLISHED THIS]",
            "ph": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "Who we are"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Pechkas runs an app that connects people in Islamabad who need something repaired at home with technicians Pechkas has checked. These terms cover customers using the app. The technicians have their own agreement, at "
          },
          {
            "t": "/app/technician-agreement",
            "href": "/app/technician-agreement"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Registered name and address: "
          },
          {
            "t": "[REGISTERED BUSINESS NAME AND ADDRESS]",
            "mark": true
          }
        ]
      },
      {
        "k": "decide",
        "c": [
          {
            "t": "[DECIDE WITH A LAWYER]",
            "mark": true
          },
          {
            "t": " Who your agreement for the repair is with. Either "
          },
          {
            "t": "Pechkas",
            "i": true
          },
          {
            "t": " is responsible for the work and the technician works for Pechkas — which is what the website's own terms say for WhatsApp bookings — or the agreement is between "
          },
          {
            "t": "you and the technician",
            "i": true
          },
          {
            "t": ", and Pechkas introduces you, checks him, and stands behind the guarantee. This changes several sections below, and the answer must be the same everywhere Pechkas says it."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Your account"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "You must be 18 or over, and use your own mobile number. You sign in with a code sent to it."
            }
          ],
          [
            {
              "t": "Keep your phone locked: anybody holding it can use your account."
            }
          ],
          [
            {
              "t": "You can delete your account at any time in the app: open the menu, tap "
            },
            {
              "t": "Settings",
              "b": true
            },
            {
              "t": ", then "
            },
            {
              "t": "Delete my account",
              "b": true
            },
            {
              "t": ". See "
            },
            {
              "t": "/app/delete-account",
              "href": "/app/delete-account"
            },
            {
              "t": "."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Posting a job and naming a price"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "You say what is wrong, where and when, and the price you will pay. The app shows Pechkas' usual price for common jobs as a guide. You may offer what you like above the lowest price the app shows."
            }
          ],
          [
            {
              "t": "Jobs can be posted only in the sectors the app lists, because nobody could honestly be promised anywhere else."
            }
          ],
          [
            {
              "t": "Please describe the job truthfully. If the work turns out bigger than described, the price may change — but only as set out below."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Choosing a technician"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Checked technicians who do that work in your sector may accept your price or offer their own, saying how soon they can come. You choose one, or none. Offers run out after a few minutes; the app shows how long each has left."
            }
          ],
          [
            {
              "t": "Only once you choose does that technician see your address and number, and you his."
            }
          ],
          [
            {
              "t": "You may ask for a technician who worked for you before. He sees your job first for a few minutes; then every checked technician can."
            }
          ],
          [
            {
              "t": "If nobody offers, Pechkas may ring technicians and arrange one for you, at a price agreed with you first."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "The price"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "The price agreed in the app is the price.",
              "b": true
            },
            {
              "t": " The technician cannot change it at your door. If he finds the job is bigger, he must send a new price in the app, with the reason and a photo, and nothing changes unless you approve it."
            }
          ],
          [
            {
              "t": "If you decline a new price, the job stops there and you pay only the "
            },
            {
              "t": "visit fee",
              "b": true
            },
            {
              "t": " for his trip. The app shows the visit fee before you post, and again when a new price is asked."
            }
          ],
          [
            {
              "t": "Parts he buys for the job are paid for at the shop's price, with a photo of the receipt in the app. Pechkas takes nothing from parts."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Paying"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "You pay the technician when the work is finished, in cash. The app shows exactly how much. The app takes no payments and Pechkas never holds your money. Nothing is paid in advance."
          }
        ]
      },
      {
        "k": "h2",
        "text": "When he comes"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Your app shows a four-digit "
            },
            {
              "t": "start code",
              "b": true
            },
            {
              "t": ". Give it only to the person at your door whose name the app shows. It proves he is the one the app sent."
            }
          ],
          [
            {
              "t": "Someone aged 18 or over must be at the property to let him in and to approve the work. Tell him about anything there that affects safety."
            }
          ],
          [
            {
              "t": "He takes photos before and after the work. They are kept with the job, where you and the Pechkas office can see them."
            }
          ],
          [
            {
              "t": "He may refuse work he considers unsafe, or that needs a licence or approval he does not hold. "
            },
            {
              "t": "Pechkas does not repair gas leaks.",
              "b": true
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Cancelling"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "You can cancel in the app, free, until the technician arrives. Once he has arrived, decline any new price in the app, or call the Pechkas office."
            }
          ],
          [
            {
              "t": "Pechkas may cancel a job, for example if nobody can go, and the app tells you why."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "The guarantee"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Work done through the app is guaranteed for 30 days from the day it was finished. If it fails in that time, tap "
          },
          {
            "t": "It has failed again",
            "b": true
          },
          {
            "t": " on the job, and Pechkas arranges for it to be put right at no charge. "
          },
          {
            "t": "[CONFIRM WITH A LAWYER: whether the exclusions on the website's ",
            "mark": true
          },
          {
            "t": "guarantee page",
            "mark": true,
            "href": "/guarantee"
          },
          {
            "t": " apply to app jobs too, such as parts you supplied yourself.]",
            "mark": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "Problems, damage and emergencies"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Report a problem in the app while the job is on, or within a day after. It goes straight to the Pechkas office, which will ring you."
            }
          ],
          [
            {
              "t": "If something is damaged while he works, report it straight away with a photo. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: who pays for damage, and up to how much.]",
              "mark": true
            }
          ],
          [
            {
              "t": "The "
            },
            {
              "t": "emergency button",
              "b": true
            },
            {
              "t": " on a job alerts the Pechkas office at once and shows the police, Rescue 1122, fire brigade and Edhi numbers. In danger, call those first."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Ratings and blocking"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "You and the technician can rate each other after the job. Neither sees the other's rating until both have rated or two days have passed. Rate honestly; do not offer or accept anything for a rating."
            }
          ],
          [
            {
              "t": "After a job, you can block a technician. He will never see your jobs again, and he is not told. You can undo it on the same job."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "What you must not do"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Post a false job, or offer a price you do not mean to pay."
            }
          ],
          [
            {
              "t": "Arrange to pay a technician outside the app for a job you found through it, to avoid the app."
            }
          ],
          [
            {
              "t": "Threaten, abuse or harass a technician, or ask him for anything unrelated to the job."
            }
          ],
          [
            {
              "t": "Write a phone number or a CNIC number in a job, a message or a rating."
            }
          ]
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "The Pechkas office looks out for patterns that can mean misuse. A person looks, and will ring you before deciding anything. Pechkas may close an account that breaks these terms."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Limits"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "[DECIDE WITH A LAWYER: the limit of Pechkas' responsibility, the law that applies (Pakistan) and where disputes are heard.]",
            "mark": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "Your information"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "What the app collects, who sees it and how to have it deleted is in the "
          },
          {
            "t": "app privacy policy",
            "href": "/app/privacy"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Changes"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "If these terms change, we change this page and the date at the top. The terms that apply to a job are the ones published when you posted it."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Getting in touch"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "WhatsApp us",
            "href": "https://wa.me/923358855076?text=About%20the%20Pechkas%20app%20terms"
          },
          {
            "t": " or "
          },
          {
            "t": "call 0335 8855076",
            "href": "tel:+923358855076"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "review",
        "paras": [
          [
            {
              "t": "[REVIEW WITH A LAWYER BEFORE PUBLISHING]",
              "mark": true
            }
          ],
          [
            {
              "t": "A plain-language draft written to match what the app does. It is not legal advice. Before the app is public, have a lawyer read it against Pakistani law, settle every bracketed decision, and then remove this box."
            }
          ]
        ]
      }
    ]
  },
  "technician-agreement": {
    "title": "Technician agreement",
    "lede": "What Pechkas expects of a technician who takes jobs through the app, what you can expect of Pechkas, and how the money works.",
    "web": "https://pechkas.net/app/technician-agreement",
    "blocks": [
      {
        "k": "meta",
        "c": [
          {
            "t": "Last updated: "
          },
          {
            "t": "[DATE YOU PUBLISHED THIS]",
            "ph": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "Who this is between"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "You, the technician, and Pechkas ("
          },
          {
            "t": "[REGISTERED BUSINESS NAME AND ADDRESS]",
            "mark": true
          },
          {
            "t": "), which runs the app in Islamabad."
          }
        ]
      },
      {
        "k": "decide",
        "c": [
          {
            "t": "[DECIDE WITH A LAWYER]",
            "mark": true
          },
          {
            "t": " Whether you work for Pechkas, or run your own work and take jobs through the app. It decides tax, who is responsible to the customer, and much of what follows, and it must agree with the customer terms at "
          },
          {
            "t": "/app/terms",
            "href": "/app/terms"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Joining"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Applying is free. Pechkas never charges a rupee to apply",
              "b": true
            },
            {
              "t": ", and nobody may ask you to pay to join."
            }
          ],
          [
            {
              "t": "Before you get a single job, Pechkas checks who you are (in person or by video call), gives you a trial job, and goes through these rules with you. All three are written down: the date, how, and who did it."
            }
          ],
          [
            {
              "t": "Pechkas never records your CNIC number or keeps a copy of your CNIC.",
              "b": true
            },
            {
              "t": " It is looked at during the check, and only the fact that it was checked is kept."
            }
          ],
          [
            {
              "t": "You must be 18 or over, and tell the truth about your trade, your years and where you work."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Getting jobs"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "While you are "
            },
            {
              "t": "online",
              "b": true
            },
            {
              "t": ", you see jobs in your trades and sectors: the sector, the customer's first name, what is wrong and the price offered. Not the address or number."
            }
          ],
          [
            {
              "t": "You accept the customer's price or offer your own, within the limits the app shows, and say how soon you can come. You choose which jobs to offer on."
            }
          ],
          [
            {
              "t": "Only when a customer chooses you do you get the address and the number, and only while the job is on. Use them for that job and nothing else."
            }
          ],
          [
            {
              "t": "A customer can block you after a job. You will not be told, and you will not see that customer's jobs again."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Doing the job"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Tap each step in the app: on your way, arrived. Go when you said you would."
            }
          ],
          [
            {
              "t": "At the door, ask the customer for the four-digit start code, and take a photo before you start."
            }
          ],
          [
            {
              "t": "The agreed price is the price.",
              "b": true
            },
            {
              "t": " If the job is bigger, send the new price in the app with the reason and a photo. Never ask for more at the door. If the customer declines, stop: you are paid the visit fee the app shows for your trip."
            }
          ],
          [
            {
              "t": "Parts are charged at the shop's price, with a photo of the receipt in the app."
            }
          ],
          [
            {
              "t": "Finish with a photo of the work. The app tells you exactly what to collect."
            }
          ],
          [
            {
              "t": "Refuse work you consider unsafe, or that needs a licence or approval you do not hold. "
            },
            {
              "t": "Pechkas does not repair gas leaks.",
              "b": true
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Money"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "The customer pays you, in cash, when the work is finished. The app holds no money."
            }
          ],
          [
            {
              "t": "The Pechkas fee is 10% of your labour",
              "b": true
            },
            {
              "t": " — the price minus the parts with a receipt — rounded down, so odd paisa stay with you. It is "
            },
            {
              "t": "7%",
              "b": true
            },
            {
              "t": " when the customer has had a job done by you before. There is no fee on a visit fee. The app shows the fee and what you keep before you offer."
            }
          ],
          [
            {
              "t": "You owe the fee to Pechkas when the job is done. The app shows what you owe, line by line. Pay it by JazzCash, Easypaisa, bank or cash, as the app tells you, and tell the office the transaction ID."
            }
          ],
          [
            {
              "t": "While you owe more than "
            },
            {
              "t": "Rs 3,000",
              "b": true
            },
            {
              "t": ", you cannot send new offers until you pay."
            }
          ],
          [
            {
              "t": "Part of each fee is set aside to pay for putting right work that fails within the guarantee. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: whether you must come back and redo failed work free, and what happens if you cannot.]",
              "mark": true
            }
          ],
          [
            {
              "t": "Records of what you owed and paid are kept even after your account is deleted, for accounting."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Conduct"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Be polite and honest with every customer, and with their family and staff."
            }
          ],
          [
            {
              "t": "Do not give your number or ask for the customer's before you are chosen."
            }
          ],
          [
            {
              "t": "Do not arrange to do a job outside the app with a customer you met through it, to avoid the Pechkas fee."
            }
          ],
          [
            {
              "t": "Do not offer anything for a rating, or rate a customer falsely."
            }
          ],
          [
            {
              "t": "Never write a phone number or a CNIC number in an offer, a message or a note."
            }
          ],
          [
            {
              "t": "If something goes wrong, report it in the app. In danger, press the emergency button: it alerts the office at once and shows the police and Rescue numbers."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Ratings, flags and suspension"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Customers rate you after each job. Customers see \"New\" until you have enough ratings, then your stars and how many jobs you have done."
            }
          ],
          [
            {
              "t": "The office looks at patterns that can mean misuse, such as jobs often cancelled after you are chosen. "
            },
            {
              "t": "Nothing happens automatically:",
              "b": true
            },
            {
              "t": " a person looks, and rings you first."
            }
          ],
          [
            {
              "t": "Pechkas may suspend or end your access for breaking this agreement, and tells you why. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: notice, and how you can ask for a decision to be looked at again.]",
              "mark": true
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Leaving"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "You can stop at any time: go offline, or delete your account in the app. Pay what you owe first. See "
          },
          {
            "t": "/app/delete-account",
            "href": "/app/delete-account"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Your information"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "What the app keeps about you, who sees it and how to have it deleted is in the "
          },
          {
            "t": "app privacy policy",
            "href": "/app/privacy"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Changes"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "If this agreement changes, we change this page and the date at the top, and tell you before the change applies to you. "
          },
          {
            "t": "[DECIDE WITH A LAWYER: how much notice.]",
            "mark": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "Getting in touch"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "WhatsApp us",
            "href": "https://wa.me/923358855076?text=About%20the%20Pechkas%20technician%20agreement"
          },
          {
            "t": " or "
          },
          {
            "t": "call 0335 8855076",
            "href": "tel:+923358855076"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "review",
        "paras": [
          [
            {
              "t": "[REVIEW WITH A LAWYER BEFORE PUBLISHING]",
              "mark": true
            }
          ],
          [
            {
              "t": "A plain-language draft written to match what the app does. It is not legal advice. Before the app is public, have a lawyer read it against Pakistani law, settle every bracketed decision, and then remove this box."
            }
          ]
        ]
      }
    ]
  },
  "delete-account": {
    "title": "Delete your Pechkas app account",
    "lede": "You can do it yourself in the app in a few seconds, or ask us if you no longer have it.",
    "web": "https://pechkas.net/app/delete-account",
    "blocks": [
      {
        "k": "h2",
        "text": "In the app"
      },
      {
        "k": "ol",
        "items": [
          [
            {
              "t": "Open the Pechkas app and sign in."
            }
          ],
          [
            {
              "t": "Open the menu at the top left and tap "
            },
            {
              "t": "Settings",
              "b": true
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "Tap "
            },
            {
              "t": "Delete my account",
              "b": true
            },
            {
              "t": ", then "
            },
            {
              "t": "Yes, delete it",
              "b": true
            },
            {
              "t": "."
            }
          ]
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "It happens at once. You are signed out and the account cannot be brought back."
          }
        ]
      },
      {
        "k": "h2",
        "text": "Without the app"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "Message or call us "
          },
          {
            "t": "from the phone number on the account",
            "b": true
          },
          {
            "t": ", so we know the request is yours, and say you want the app account deleted. We delete it within "
          },
          {
            "t": "[HOW MANY DAYS]",
            "ph": true
          },
          {
            "t": " and tell you when it is done."
          }
        ]
      },
      {
        "k": "actions",
        "items": [
          {
            "label": "Ask on WhatsApp",
            "href": "https://wa.me/923358855076?text=Please%20delete%20my%20Pechkas%20app%20account.%20The%20number%20on%20the%20account%20is%20this%20one.",
            "kind": "whatsapp"
          },
          {
            "label": "Call 0335 8855076",
            "href": "tel:+923358855076",
            "kind": "call"
          }
        ]
      },
      {
        "k": "h2",
        "text": "What is deleted"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Your number, your name and your sign-in."
            }
          ],
          [
            {
              "t": "Your jobs, their addresses and details, and the voice notes, videos and photos you uploaded."
            }
          ],
          [
            {
              "t": "Your messages, ratings, problem reports and notification settings."
            }
          ],
          [
            {
              "t": "For a technician: your application and the record of the checks Pechkas did."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "What is kept, and why"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "For a technician:",
              "b": true
            },
            {
              "t": " the record of what you owed Pechkas and what you paid, with your name, the job numbers and the payment references. Pechkas has to keep its accounts; it holds nothing about any customer. Kept for "
            },
            {
              "t": "[HOW LONG THE LAW REQUIRES]",
              "ph": true
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "For a customer:",
              "b": true
            },
            {
              "t": " photos a technician took at your home stay in Pechkas' private storage, where only the office can open them, for "
            },
            {
              "t": "[HOW LONG]",
              "ph": true
            },
            {
              "t": ", then are deleted."
            }
          ],
          [
            {
              "t": "A job a technician did for a customer who still has an account stays on that customer's record, without the technician's details."
            }
          ]
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "More about what the app collects: "
          },
          {
            "t": "the app's privacy policy",
            "href": "/app/privacy"
          },
          {
            "t": "."
          }
        ]
      },
      {
        "k": "review",
        "paras": [
          [
            {
              "t": "[REVIEW WITH A LAWYER BEFORE PUBLISHING]",
              "mark": true
            }
          ],
          [
            {
              "t": "Fill in the bracketed periods with a lawyer, then remove this box."
            }
          ]
        ]
      }
    ]
  }
};
