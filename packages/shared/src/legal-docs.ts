// Copied from zaibprops-code/Pechkas src/pages/app/*.astro (built) by scripts/copy-legal.mjs.
// Do not edit by hand: change the website's page, build it, then run that script.
import type { LegalDoc, LegalSlug } from './legal.ts';

/** The website commit these were copied from. */
export const LEGAL_FROM = "5c88240";

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
              "t": " (on Android): Google tells us your email address, your name, the link to your Google profile picture, and a number for your Google account, so that the same Google account always opens the same Pechkas account. Your first name fills in the box on the welcome screen, and you can change it. The app never shows the picture. You then type your mobile number yourself, as with an email."
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
              "t": "The pin you put on the house on a map. Every job needs one, so that the technician can find the house."
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
          ],
          [
            {
              "t": "If you tap "
            },
            {
              "t": "Tell me when it is",
              "b": true
            },
            {
              "t": " on a kind of job that is not available yet: the kind of job and your sector, so we can tell you when it opens and know where it is needed."
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
              "t": "A photo of your face",
              "b": true
            },
            {
              "t": ", taken with the app's camera, and any later photo you ask to change it to, with your reason and the owner's answer. Customers who receive your offer, and the customer whose job you are given, see it, to check it is you at their door. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: keeping and showing a photo used to identify a person.]",
              "mark": true
            }
          ],
          [
            {
              "t": "Your answers to the rules quiz and the safety quizzes: which questions you were given, how many you got right, and whether you passed, so the app knows whether you may take jobs."
            }
          ],
          [
            {
              "t": "For each trade: whether you are on your first jobs, approved, paused or stopped, and every change to that, with the reason; your first jobs and whether each one counted and why; any appeal you write and the office's answer; and any checked job, with what the technician who checked it found and his photos. If you check another technician's job, the same record, and any time a technician you passed later had a claim found against him."
            }
          ],
          [
            {
              "t": "Once an identity-checking service is in use: that you used it, whether your identity matched, the date and the service's own reference. "
            },
            {
              "t": "We never record a CNIC number or keep a copy of a CNIC",
              "b": true
            },
            {
              "t": ", and the service does not give us one. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: checking identity against NADRA's records through another company, the consent it needs, and what that company keeps.]",
              "mark": true
            },
            {
              "t": "Technicians approved before these rules: the date Pechkas staff saw their identity, as it was recorded then."
            }
          ],
          [
            {
              "t": "What you owe Pechkas and what you have paid, with the payment reference. If you tap "
            },
            {
              "t": "I have paid",
              "b": true
            },
            {
              "t": ", the amount, how you paid, the transaction ID and the screenshot you add, which only the office sees, to check the money arrived. A screenshot may show the account you paid from."
            }
          ],
          [
            {
              "t": "For each fee you owe, its due date and which payment paid it; the reminders sent to you; any extra time the office gave you, with its reason and who gave it; and your appeal against a visit fee refund charge, with the office's decision. The office also keeps a list of public holidays, which holds no personal information."
            }
          ],
          [
            {
              "t": "Where your phone is, at two moments only",
              "b": true
            },
            {
              "t": ": when you tap "
            },
            {
              "t": "I have arrived",
              "b": true
            },
            {
              "t": " (and "
            },
            {
              "t": "Check my location again",
              "b": true
            },
            {
              "t": "), and when you report that nobody is home. We record the position, how precise your phone said it was, when it was taken, whether your phone reported it as faked, and how far it was from the customer's pin, to check that you reached the address. Never in the background and never between those moments. If you refuse location, the app still works and the office looks at the arrival instead."
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
              "t": "Each step and its time: on the way, arrived, started, finished, checked."
            }
          ],
          [
            {
              "t": "Photos the technician takes before and after, and of any shop receipt for parts, and the short "
            },
            {
              "t": "Show it working",
              "b": true
            },
            {
              "t": " video if he adds one."
            }
          ],
          [
            {
              "t": "Any new price asked at the door, with its reason and photo, and the answer."
            }
          ],
          [
            {
              "t": "The customer's check of the work: whether she tapped "
            },
            {
              "t": "Yes, it works",
              "b": true
            },
            {
              "t": " or "
            },
            {
              "t": "Not finished yet",
              "b": true
            },
            {
              "t": ", or neither and the job closed itself after 24 hours; for "
            },
            {
              "t": "Not finished yet",
              "b": true
            },
            {
              "t": ", the reason she chose, her note and her photo; and the technician's one-line reply."
            }
          ],
          [
            {
              "t": "If the job went to the Pechkas office, what the office decided, its note and who in the office decided it."
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
              "t": "On one of a technician's first jobs, the customer's answers to three questions: whether he came on time, explained the work, and left the place clean."
            }
          ],
          [
            {
              "t": "At the door, whether the customer confirmed that the technician was the man in his photo."
            }
          ],
          [
            {
              "t": "Problems reported, and safety reports, with the words and any photo, the technician's side and the office's decision."
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
        "text": "Guarantee claims"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "What the customer writes when she taps "
            },
            {
              "t": "It has failed again",
              "b": true
            },
            {
              "t": ", and the photos and videos she adds."
            }
          ],
          [
            {
              "t": "The technician's answer and when he gave it: the two-hour window he chose to come back in, or, if he said "
            },
            {
              "t": "This isn't my work",
              "b": true
            },
            {
              "t": ", his reason."
            }
          ],
          [
            {
              "t": "The photos of the repair, whether the customer said it worked, and her words if it did not."
            }
          ],
          [
            {
              "t": "If another technician was sent instead: why, which job that became, and, if the Pechkas office raised what Pechkas would pay for it, by how much, who raised it and why."
            }
          ],
          [
            {
              "t": "What the Pechkas office decided, its notes and who in the office decided; any amount charged to the original technician, and the date it was due to be added; and his appeal, with its words and photos, and the office's answer."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "Visit fees"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "When a job stops because a new price was declined: the fee, who pays it, why, the new price with its reason and photo, and who declined it."
            }
          ],
          [
            {
              "t": "Whether the technician says he was paid; whether the customer disagreed or says she paid, and the words she wrote; and what the Pechkas office decided, its note and who decided."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "A payment question"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "When a technician says a customer did not pay him in full: what he says he received, the price and parts of the job, and when he said it. The customer's answer (that it is right, or that she has paid), the words she writes and her screenshot if she adds one. What the Pechkas office recorded and decided, its note, who decided and when, and whether it found his report false. The fee Pechkas held and charged on the job is in the money record described below."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "Cancellations and arriving on time"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "When a job is cancelled: who cancelled it and when, the step the job had reached, the reason chosen and any words added, when the technician's time began, when he said he was on his way and when he arrived, and what kind of cancellation it was (for example late, or because he was late). If the Pechkas office reviewed it: its note and who wrote it."
            }
          ],
          [
            {
              "t": "For technicians: each late arrival and each time he had not arrived 30 minutes after his time ended, how many minutes it was, anything he wrote about it, and what the office decided, its note and who decided."
            }
          ],
          [
            {
              "t": "When a technician says he is running late: the time he gives, when he gave it, and his original time. When he says he cannot come: the reason he chose, any words he added, the step the job had reached and the time. When a job goes to another technician: who had it before, when he was chosen and when he left, and why (he could not come, or the customer chose another). If the office pauses a technician's new offers: how long, its reason, and who did it."
            }
          ],
          [
            {
              "t": "If a technician cannot get in: the reason (nobody answering, or the guard), when he arrived, when his time began, when the customer was told and whether she said she was coming, his photo of the gate or door and any note, the time he reported it, her words if she says she was home, and what the office decided. His position when he reports it is checked the same way as his arrival (see Technicians above)."
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
            "t": "The office looks at patterns across jobs that can mean somebody is misusing the app: for example many late cancellations by one customer, a technician who is often late or does not arrive, many wrong start codes, a technician whose jobs often close only because nobody checked them, a customer whose "
          },
          {
            "t": "Not finished yet",
            "b": true
          },
          {
            "t": " the office often finds was not so, repeated guarantee claims on one technician's work, a technician who often reports that he was not paid, a report the office found false, or a customer who more than once did not pay a technician in full. It may write a note about what it found. "
          },
          {
            "t": "A flag on its own decides nothing",
            "b": true
          },
          {
            "t": ": a person looks, and may ring you before deciding anything."
          }
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "One thing is decided by rule, from the records above: whether a technician may take jobs, and which. The app approves him from his checked number, his photo and his quizzes; counts his first jobs from the customers' answers, his photos and the fees paid; and pauses his work after a safety report, a \"this is not him\" at a door, or repeated \"no\"s on his first jobs. He can see why in the app and appeal in writing, and a person in the office decides the appeal. "
          },
          {
            "t": "[DECIDE WITH A LAWYER: decisions made by rule from personal information, and what must be said about them.]",
            "mark": true
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
              "t": "Card or bank details. The app takes no payments: customers pay the technician directly, in cash, by JazzCash or by Easypaisa, and Pechkas never holds their money."
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
              "t": ", that one technician sees the address, the landmark, the gate note, the map pin, and the customer's number, while the job is on. They leave his app when the job ends."
            }
          ],
          [
            {
              "t": "The customer",
              "b": true
            },
            {
              "t": " sees the technician's first name, his photo, years in the trade, his trades and whether he is new in them, what Pechkas knows about who he is, how many jobs he has done, his stars once he has enough ratings, what customers wrote about him, and his number while the job is on."
            }
          ],
          [
            {
              "t": "Ratings",
              "b": true
            },
            {
              "t": " stay hidden from the other person until both have rated, or two days have passed. A technician's rating of a customer is seen only by Pechkas. The stars and any words a customer gives a technician may be shown to other customers choosing him, "
            },
            {
              "t": "without the writer's name",
              "b": true
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "Prices of finished jobs.",
              "b": true
            },
            {
              "t": " When a job is finished, Pechkas keeps a separate price record of it: the kind of job, the sector, the day, the customer's first price, the agreed price and what of it was parts. It holds no name, phone number, address or technician. From it, customers and technicians are shown what recent jobs of the same kind went for, as a range, and only once there are at least 10 such jobs, so no one person's price can be picked out."
            }
          ],
          [
            {
              "t": "Checking the work.",
              "b": true
            },
            {
              "t": " The technician sees the reason the customer chose for "
            },
            {
              "t": "Not finished yet",
              "b": true
            },
            {
              "t": ", her note and her photo. The customer sees his one-line reply."
            }
          ],
          [
            {
              "t": "Guarantee claims.",
              "b": true
            },
            {
              "t": " The technician whose work it was sees what the customer wrote and her photos and videos. The customer sees whether he is coming and when, but "
            },
            {
              "t": "not his reason",
              "b": true
            },
            {
              "t": " if he says it is not his work. A technician sent instead sees the job as he would any other. When the office decides a disputed job or a claim, its decision and the note explaining it may be shown to both of them. A charge to the technician, and his appeal against it, are seen only by him and the office."
            }
          ],
          [
            {
              "t": "A payment question.",
              "b": true
            },
            {
              "t": " The customer sees what the technician says he received. The technician sees whether she has answered and what the office decided, but "
            },
            {
              "t": "never the words she wrote or her screenshot",
              "b": true
            },
            {
              "t": ". The notification she gets says only that there is a question about payment for the job. The office sees all of it."
            }
          ],
          [
            {
              "t": "First jobs and checks.",
              "b": true
            },
            {
              "t": " A technician sees whether each of his first jobs counted and why not, but "
            },
            {
              "t": "never the customer's answers",
              "b": true
            },
            {
              "t": ". A technician asked to check another's job sees that job's trade, sector, day and the other technician's first name, and the address only once he says yes and while the job is on. Safety reports, what the customer wrote and the technician's side are seen by the office; the technician sees the decision."
            }
          ],
          [
            {
              "t": "A technician's location checks.",
              "b": true
            },
            {
              "t": " Only the Pechkas office sees where his phone was. He sees only whether his arrival was verified and how far he was from the pin. The customer sees only \"Technician arrival verified\" when it was, never where he is or was. No notification carries a location."
            }
          ],
          [
            {
              "t": "Cancellations and lateness.",
              "b": true
            },
            {
              "t": " A technician sees his own late arrivals and no-shows, what he wrote and the office's note, but not how a customer's cancellation was recorded. A customer sees how her own cancellations were recorded, but not the technician's record. She is told the first name of a technician who could not come, never his reason; he sees the reasons he gave, and any pause with the office's reason. The office's notes on a customer's cancellations are seen only by the office."
            }
          ],
          [
            {
              "t": "The Pechkas office",
              "b": true
            },
            {
              "t": " can see everything about a job, including its chat, photos, checks and guarantee claims, to run the service, handle complaints and keep everyone safe. Each person in the office has their own login."
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
              "t": " on iPhone draw the maps inside the app. To draw one they receive the area being shown: the place you pin, or where you are if you tap to show it. When you put the pin on the house, the phone's own map service (Google's on Android, Apple's on iPhone) is also asked which sector and street the pin is in, so that you do not have to type them; it receives the place you pinned. Pechkas itself keeps only the pin of a job you post, and, for technicians, the two location checks described above. Checking a location uses no outside map service: the distance is worked out by Pechkas itself."
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
              "t": "A job's checks, guarantee claims, visit fee, payment question and cancellation are kept with the job: the reasons, notes, photos and videos, the technician's replies and answers, the office's decisions and notes, and any appeal. They are deleted with the customer's account. A technician's record of late arrivals and no-shows is deleted with his account, and so are the reports he made that he could not get in, the times he said he was running late or could not come, and the office's pauses. Who had a job before is kept with the job; when a technician's account is deleted, his name is taken off it."
            }
          ],
          [
            {
              "t": "A technician's photo, quiz results, first-job records, checks and pauses are deleted with his account. A safety report about a technician stays on his record if the customer who made it deletes her account, without her name. Answers a customer gave about a technician's first jobs are deleted with that job."
            }
          ],
          [
            {
              "t": "A technician's exact positions are kept for 90 days at most",
              "b": true
            },
            {
              "t": ", then erased automatically; what the check found (the distance, how precise it was, the time and the result) stays with the job. They are deleted earlier with the job or the account."
            }
          ],
          [
            {
              "t": "Kept after deletion:",
              "b": true
            },
            {
              "t": " the record of what a technician owed Pechkas and paid, which we keep for accounting. That includes any guarantee charge to a technician and any payment Pechkas made for a guarantee repair or a visit fee. It holds the job number, the amounts and the technician's name, and nothing about the customer."
            }
          ],
          [
            {
              "t": "[DECIDE WITH A LAWYER: how long the record that a customer owed a technician is kept, how accurate it must be, and how she can have it corrected.]",
              "mark": true
            }
          ],
          [
            {
              "t": "Also kept after deletion:",
              "b": true
            },
            {
              "t": " a record of each visit a technician made where he could not get in: the job number, trade, sector, day, the reason, how long he waited and the outcome. It names no customer, and the technician's name comes off it when he deletes his account. Pechkas uses it to understand what these visits cost."
            }
          ],
          [
            {
              "t": "Also kept after deletion:",
              "b": true
            },
            {
              "t": " the price record of finished jobs described above. It says nothing about who anybody was, so it is not linked to you once your account is gone."
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
              "t": "Addresses you save as "
            },
            {
              "t": "Home",
              "b": true
            },
            {
              "t": ", "
            },
            {
              "t": "Office",
              "b": true
            },
            {
              "t": " or "
            },
            {
              "t": "Other",
              "b": true
            },
            {
              "t": ", and the address you used last, are kept "
            },
            {
              "t": "on your phone only",
              "b": true
            },
            {
              "t": ". Pechkas receives one only when you post a job with it. Signing out, or deleting your account, removes them from the phone."
            }
          ],
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
            "t": "Pechkas runs an app that connects people in Islamabad who need something repaired at home with technicians approved by the app's own rules, described below. These terms cover customers using the app. The technicians have their own agreement, at "
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
              "t": "Technicians who do that work in your sector may accept your price or offer their own, saying when they can come. You choose one, or none. Offers run out after a few minutes; the app shows how long each has left."
            }
          ],
          [
            {
              "t": "Each offer shows the technician's photo and what Pechkas knows about him: that his mobile number was checked by SMS, and, once an identity service is in use, whether it verified his identity. Pechkas does not say his identity was checked unless that service checked it."
            }
          ],
          [
            {
              "t": "\"New on Pechkas\"",
              "b": true
            },
            {
              "t": " means this is one of his first three jobs in that trade. On them he takes only basic work, one job at a time, up to a price limit, and your answers to four short questions afterwards decide whether the job counts towards his approval."
            }
          ],
          [
            {
              "t": "Some kinds of job are risky, such as wiring faults, gas geysers and AC gas. They are offered only where a technician whose risky work has been checked can do them; elsewhere the app says the kind of job is not available yet, and can tell you when it is. A technician's first job of such a kind is a "
            },
            {
              "t": "checked visit",
              "b": true
            },
            {
              "t": ": another Pechkas technician comes too and checks the work, at no cost to you, and the app tells you his name."
            }
          ],
          [
            {
              "t": "Only once you choose does that technician see your address and number, and you his."
            }
          ],
          [
            {
              "t": "You may ask for a technician who worked for you before. He sees your job first for a few minutes; then every technician who does that work can."
            }
          ],
          [
            {
              "t": "If nobody offers, the app tells you and lets you raise your price or choose another day. A job nobody takes closes by itself at 8pm on its day; nothing is owed, and you can post it again."
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
              "t": "He can ask a new price only after you have given him the start code and he has looked at the fault. If you decline it, the job stops there and you pay him only the "
            },
            {
              "t": "visit fee",
              "b": true
            },
            {
              "t": " for his trip. The app shows the visit fee before you post, before you choose a technician, and again when a new price is asked. The fee is fixed when you choose him: if Pechkas changes it later, you still pay the one you were shown."
            }
          ],
          [
            {
              "t": "There is no visit fee",
              "b": true
            },
            {
              "t": " when the repair goes ahead, when the technician does not arrive, when the job is a guarantee repair, or when the Pechkas office decides the work failed because of him. The whole visit fee is his; Pechkas takes nothing from it."
            }
          ],
          [
            {
              "t": "If you think a visit fee is wrong, open the job and tap "
            },
            {
              "t": "I disagree with this fee",
              "b": true
            },
            {
              "t": " within 24 hours. The Pechkas office looks, and either keeps it or waives it. If it waives a fee you already paid, the technician gives it back, or Pechkas does."
            }
          ],
          [
            {
              "t": "If the technician says you have not paid a visit fee, you cannot post a new job until it is settled: pay him, or tap "
            },
            {
              "t": "I have paid him",
              "b": true
            },
            {
              "t": " and the office looks. If Pechkas pays him the fee you owed, you settle it with Pechkas before you post again. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: whether Pechkas may hold back a customer's new bookings over an unpaid visit fee, and recover a fee it paid on her behalf.]",
              "mark": true
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
              "t": "Before you give the code, look at him and at the photo in the app, and tap "
            },
            {
              "t": "Yes, this is the man in the photo",
              "b": true
            },
            {
              "t": ". If it is somebody else, tap "
            },
            {
              "t": "No, it is somebody else",
              "b": true
            },
            {
              "t": " and do not let him in: the job goes back to other technicians, you owe nothing, and Pechkas is told."
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
        "text": "Checking the work"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "When he has finished, the technician taps "
            },
            {
              "t": "Work finished",
              "b": true
            },
            {
              "t": " in the app, with a photo of the finished work and, if he chooses, a short video showing it working. The job is not closed yet: the app asks you to check it."
            }
          ],
          [
            {
              "t": "If it works, tap "
            },
            {
              "t": "Yes, it works",
              "b": true
            },
            {
              "t": ". The job is finished, and you pay him."
            }
          ],
          [
            {
              "t": "On one of a technician's first jobs, the app also asks whether he came at the time he said, explained the work before starting, and left the place clean. Please answer honestly: your answers decide whether the job counts towards his approval. He sees only whether it counted, not what you said."
            }
          ],
          [
            {
              "t": "If it does not, tap "
            },
            {
              "t": "Not finished yet",
              "b": true
            },
            {
              "t": " and choose the reason: "
            },
            {
              "t": "Still not working",
              "i": true
            },
            {
              "t": ", "
            },
            {
              "t": "Work left unfinished",
              "i": true
            },
            {
              "t": ", "
            },
            {
              "t": "Mess left behind",
              "i": true
            },
            {
              "t": " or "
            },
            {
              "t": "Price is not what we agreed",
              "i": true
            },
            {
              "t": ". You may add a photo and a few words. He is told your reason, may answer you in one line, puts it right, and taps "
            },
            {
              "t": "Work finished",
              "b": true
            },
            {
              "t": " again."
            }
          ],
          [
            {
              "t": "If you tap "
            },
            {
              "t": "Not finished yet",
              "b": true
            },
            {
              "t": " a second time, the job goes to the Pechkas office. The office looks at both sides' photos and words, and decides one of four things: the work is finished, and you pay the agreed price; it could not be finished through no fault of his, and you pay only the visit fee; it is not finished because of his work, and you pay nothing; or he goes back to finish it."
            }
          ],
          [
            {
              "t": "If you do nothing, the app reminds you 2 hours after he taps "
            },
            {
              "t": "Work finished",
              "b": true
            },
            {
              "t": ", and again 4 hours before the time runs out. After 24 hours the job counts as finished by itself, as if you had tapped "
            },
            {
              "t": "Yes, it works",
              "b": true
            },
            {
              "t": "."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Paying the technician"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "You pay the technician directly, once the job is finished: in cash, by JazzCash or by Easypaisa. The app shows exactly how much."
            }
          ],
          [
            {
              "t": "If the job stopped because you declined a new price, or the office decided the work could not be finished through no fault of his, you pay only the visit fee, before he leaves."
            }
          ],
          [
            {
              "t": "The app takes no payments, and Pechkas never holds your money.",
              "b": true
            },
            {
              "t": " Nothing is paid in advance."
            }
          ],
          [
            {
              "t": "A guarantee repair costs you nothing; see below."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "If the technician says you have not paid in full"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Up to 7 days after a job counts as finished, the technician may tell Pechkas that you did not pay him, or paid him less than the price. Pechkas then asks you in the app. The notification says only that there is a question about payment for the job; the details are in the app."
            }
          ],
          [
            {
              "t": "You answer once, within 3 days: "
            },
            {
              "t": "That's right, I still owe it",
              "b": true
            },
            {
              "t": ", or "
            },
            {
              "t": "I have paid",
              "b": true
            },
            {
              "t": ", with a few words about how and when, and a screenshot if you have one."
            }
          ],
          [
            {
              "t": "If you say you have paid, or do not answer within 3 days, the Pechkas office looks at it, talks to you both and decides. "
            },
            {
              "t": "Not answering is never taken as agreeing",
              "b": true
            },
            {
              "t": ", and you can post jobs as usual while the office looks."
            }
          ],
          [
            {
              "t": "If you say it is right, or the office decides that you still owe it, you cannot post a new job until it is settled",
              "b": true
            },
            {
              "t": ": the technician tells Pechkas he has been paid, the office records the payment, or the office closes the question or lets you post again. The app shows the amount and why. Your answer is recorded as what you said about the amount, and nothing more. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: whether Pechkas may restrict a customer's access because of a debt to a technician, what notice it must give, and how she can challenge it]",
              "mark": true
            }
          ],
          [
            {
              "t": "Your guarantee is not affected.",
              "b": true
            },
            {
              "t": " You can still claim on the job, and a guarantee repair is never held back; see below."
            }
          ],
          [
            {
              "t": "Pechkas does not collect the money for the technician, and the app takes no payments. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: who may ask you for the money, and whether Pechkas may pass your details to anybody to do so.]",
              "mark": true
            }
          ],
          [
            {
              "t": "[DECIDE WITH A LAWYER: how accurate the record that you owed a technician must be, how long it is kept, and how you can have it corrected.]",
              "mark": true
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
              "t": "Cancelling is free.",
              "b": true
            },
            {
              "t": " You can cancel in the app until you give the technician the start code, including at your door ("
            },
            {
              "t": "I no longer need this service",
              "b": true
            },
            {
              "t": "). After that, call the Pechkas office. A cancellation never creates a visit fee, whoever cancels."
            }
          ],
          [
            {
              "t": "You can choose a reason when you cancel; adding words is optional."
            }
          ],
          [
            {
              "t": "Pechkas records every cancellation and when it happened. Cancelling within 2 hours of the technician's time, after he has told you he is on his way, or at your door, is recorded as a "
            },
            {
              "t": "late cancellation",
              "b": true
            },
            {
              "t": ". It is still free. If you have several, the Pechkas office may contact you. Nothing is decided automatically."
            }
          ],
          [
            {
              "t": "If the technician is more than 30 minutes late, the app tells you that you can cancel free, and that cancellation never counts against you. If he has not arrived 30 minutes after his time ends, you and the Pechkas office are told, and you can cancel free, find another technician, or keep waiting."
            }
          ],
          [
            {
              "t": "Pechkas may cancel a job, for example if nobody can go, and the app tells you why."
            }
          ],
          [
            {
              "t": "[DECIDE WITH A LAWYER: whether late cancellations may ever lead to a charge or a restriction, and with what notice; and whether Pechkas owes anything to a customer when a technician does not arrive.]",
              "mark": true
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "If the technician is late or cannot come"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "You never have to post the job again.",
              "b": true
            },
            {
              "t": " If the technician tells us he cannot come, or you choose another technician, the same job goes back to other technicians with everything you posted: your words, photos, voice note, address and price. The technician who left cannot see it again. If no time is left on its day, it moves to the next day and the app tells you; you can change the day or cancel free."
            }
          ],
          [
            {
              "t": "If he is held up, he can tell you in the app when he now expects to arrive, at most twice for a job. You are told at once, and you can wait or tap "
            },
            {
              "t": "Find another technician",
              "b": true
            },
            {
              "t": ". Either way costs you nothing."
            }
          ],
          [
            {
              "t": "Find another technician",
              "b": true
            },
            {
              "t": " is there until he has arrived. It is not a cancellation and nothing is charged. If he is more than 30 minutes late, or has said he is running late, it never counts against you. Used within 2 hours of his time, after he has set off, while he has not been late and has not said he would be, it is recorded like a late cancellation, exactly as cancelling would be."
            }
          ],
          [
            {
              "t": "Pechkas pays no compensation and gives no discount or credit when a technician is late or cannot come. What we do instead is put your job in front of other technicians straight away, tell you what is happening, and look at what went wrong with him. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: whether this is enough under consumer law, and whether Pechkas owes anything when a technician does not arrive.]",
              "mark": true
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Checking that he has arrived"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "When the technician taps that he has arrived, Pechkas checks his phone's location once against the pin you put on your house. If it matches, your job shows "
            },
            {
              "t": "Technician arrival verified",
              "b": true
            },
            {
              "t": ". You are never shown where he is, and he is never shown anything more than you already gave him."
            }
          ],
          [
            {
              "t": "A check can fail for ordinary reasons (a weak signal indoors, or a pin on the wrong house). That is never treated as anybody's fault by itself: the Pechkas office looks."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "If the technician cannot get in"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "If nobody answers at your door, or your guard does not let the technician in, he can ask Pechkas to tell you through the app. You then have 10 minutes to tap "
            },
            {
              "t": "I am coming",
              "b": true
            },
            {
              "t": " (or "
            },
            {
              "t": "I have told the guard",
              "b": true
            },
            {
              "t": "), which gives you 10 minutes more, or to cancel."
            }
          ],
          [
            {
              "t": "If you do not come, he can report it. His phone's location is checked against your pin when he arrives and again when he reports; if it cannot be checked, he adds a photo of the gate or door taken in the app. The job closes. "
            },
            {
              "t": "Nothing is charged to you, and nothing is paid to him.",
              "b": true
            }
          ],
          [
            {
              "t": "A report is the technician's word, not a finding. If you were home, tap "
            },
            {
              "t": "I was home",
              "b": true
            },
            {
              "t": " on the job within 24 hours, and the Pechkas office looks at both sides. Only a report the office confirms can count towards a review of your account, never one where he arrived more than 30 minutes after his time began, and never one about a guard. Nothing is decided automatically."
            }
          ],
          [
            {
              "t": "[DECIDE WITH A LAWYER: whether a customer who repeatedly is not home may ever be charged or restricted, and with what notice.]",
              "mark": true
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
            "t": "Work done through the app is guaranteed for "
          },
          {
            "t": "30 days if it was a repair or an installation",
            "b": true
          },
          {
            "t": ", and for "
          },
          {
            "t": "7 days if it was a service",
            "b": true
          },
          {
            "t": ": cleaning, servicing, a gas top-up, descaling, clearing a drain, a virus clean-up or a check-up. A service is the shorter one because it wears off by itself."
          }
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "The guarantee starts when the job counts as finished: when you tap "
          },
          {
            "t": "Yes, it works",
            "b": true
          },
          {
            "t": ", or when the 24 hours pass. You can claim on any day up to and including the last."
          }
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "If it fails in that time, tap "
          },
          {
            "t": "It has failed again",
            "b": true
          },
          {
            "t": " on the job, say what has gone wrong, and add at least one photo or video."
          }
        ]
      },
      {
        "k": "h3",
        "text": "What it covers"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "The same fault coming back, and anything the technician's work caused."
            }
          ],
          [
            {
              "t": "A part he fitted: the part itself is covered by the shop's or the maker's warranty, and Pechkas covers the labour to take it out and fit it again."
            }
          ]
        ]
      },
      {
        "k": "cross",
        "items": [
          [
            {
              "t": "A new fault that has nothing to do with the work he did."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "After you claim"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "The technician who did the work has 24 hours to answer. He either says he will come back, choosing a two-hour window that starts within 48 hours, or says it is not his work and why. If he says it is not his work, the Pechkas office decides, from the photos and what you both wrote."
            }
          ],
          [
            {
              "t": "If he does not answer in time, or does not come when he said he would, Pechkas sends another technician. You choose the day, and choose the technician in the app as you would for any job. If nobody is free that day, the app asks you to choose another, and Pechkas may pay more to find somebody. You never pay more."
            }
          ],
          [
            {
              "t": "You pay nothing for a guarantee repair",
              "b": true
            },
            {
              "t": ", whoever does it. When another technician does it, Pechkas pays him from a reserve it keeps for this: 20% of every Pechkas fee is set aside for it."
            }
          ],
          [
            {
              "t": "When the repair is done, the app asks you to check it, as before."
            }
          ]
        ]
      },
      {
        "k": "h3",
        "text": "If there is a question about payment on the job"
      },
      {
        "k": "p",
        "c": [
          {
            "t": "If the technician has said you did not pay him in full, your guarantee is exactly the same: the same length, never cancelled, delayed or reduced because of it. While that question is open, the Pechkas office handles your claim instead of the technician. It looks at your photos and decides: another technician, at Pechkas' cost; the same technician under the usual rules; or not covered, with its reason. You still pay nothing for a guarantee repair. "
          },
          {
            "t": "[DECIDE WITH A LAWYER: the guarantee on a job that has not been paid in full.]",
            "mark": true
          }
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "[DECIDE WITH A LAWYER: whether parts you supplied yourself are covered, and the limit of what Pechkas owes you under the guarantee.]",
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
              "t": "If his work has left something unsafe, such as bare wires or a smell of gas, tap "
            },
            {
              "t": "Report something unsafe",
              "b": true
            },
            {
              "t": " on the job, during it or within its guarantee. His work of that kind stops at once while the Pechkas office looks, and it decides in writing. A report the office finds false is noted on the account that made it. In danger, use the emergency button and the numbers below first."
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
              "t": "Arrange work outside the app with a technician you found through it, to avoid the app. (Paying him directly for a job in the app is how the app works, and is fine.)"
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
              "t": "Before your first job, three things are done in the app: your mobile number is checked with a code by SMS; you take a photo of your face with the app's camera; and you pass the quiz on these rules, and the safety quiz for each trade once Pechkas has switched it on. When they are done, "
            },
            {
              "t": "the app approves you by itself",
              "b": true
            },
            {
              "t": ". Nobody needs to meet you."
            }
          ],
          [
            {
              "t": "Your photo.",
              "b": true
            },
            {
              "t": " Customers see it before they choose you, and at the door they confirm it is you before they give you the start code. If a customer says the man at her door is not the man in the photo, that job goes back to other technicians, all your work is paused at once, and the Pechkas office decides; you may write your side in the app. Your photo is locked once your first job is given to you; a new one needs a reason and the owner's approval. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: keeping and showing a photo used to identify a person.]",
              "mark": true
            }
          ],
          [
            {
              "t": "Your identity.",
              "b": true
            },
            {
              "t": " Pechkas does not check identity documents yet. When an identity-checking service is available, you will be asked to use it in the app. It tells Pechkas only whether your identity matched, and its own reference. "
            },
            {
              "t": "Pechkas never records your CNIC number or keeps a copy of your CNIC.",
              "b": true
            },
            {
              "t": " "
            },
            {
              "t": "[DECIDE WITH A LAWYER: checking identity against NADRA's records through another company, and the consent it needs.]",
              "mark": true
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
        "text": "Your first jobs in each trade"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Your first 3 jobs in each trade are your trial.",
              "b": true
            },
            {
              "t": " Customers see \"New on Pechkas\" on your offer."
            }
          ],
          [
            {
              "t": "On them you take "
            },
            {
              "t": "basic jobs only, one job at a time",
              "b": true
            },
            {
              "t": ", at or under the price limit Pechkas sets, which the app shows you. \"Something else\" in a trade opens only once you are approved in it."
            }
          ],
          [
            {
              "t": "After each of these jobs the customer answers four questions: were you on time, did you explain the work before starting, did you leave the place clean, and does it work. A job counts as good when all four are yes, your before and after photos are in, no guarantee claim stands against it, the Pechkas fee on it is paid, and the customer is a real, separate person: a number checked by SMS that is not yours, a home some distance from the others, not a customer who already counted for you, and an account older than your application or one used for jobs with other technicians. The app shows you which jobs counted, and why the others did not."
            }
          ],
          [
            {
              "t": "Three good jobs and verified identity approve you in that trade",
              "b": true
            },
            {
              "t": ", by the app, with nobody deciding. Until an identity service can verify you, you stay on the first-job limits however many good jobs you do."
            }
          ],
          [
            {
              "t": "If a guarantee claim is found against one of those three jobs within its guarantee, the trade goes back to first jobs."
            }
          ],
          [
            {
              "t": "Pauses by rule.",
              "b": true
            },
            {
              "t": " A customer's safety report pauses your work in that trade at once. In your first jobs, two customers saying the work does not work, or two jobs with a \"no\" to one of the other questions, pause the trade. Jobs you already have go on. You may appeal a pause in writing in the app, and the office answers in writing; on a safety report, you write your side and the office decides. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: notice and review of a pause made by rule.]",
              "mark": true
            }
          ],
          [
            {
              "t": "The Pechkas fee is the same on your first jobs as on any other job."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Risky work"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Some kinds of job are "
            },
            {
              "t": "risky",
              "b": true
            },
            {
              "t": ": wiring and breaker faults, new points and changeover switches, water motors and gas geysers, AC gas, installation and electrical faults, the solar system check and inverter faults, fridge and freezer repair, all UPS and inverter work, and \"Something else\" in those trades."
            }
          ],
          [
            {
              "t": "They open to you only once you are approved in the trade with verified identity, you have passed that trade's safety quiz, and you have a clean record there for long enough, with no guarantee claim found against you lately; the app shows the figures. Then your first risky job is a "
            },
            {
              "t": "checked job",
              "b": true
            },
            {
              "t": ": another Pechkas technician the app picks comes too and checks your work against a list. If he passes it, your risky work is open. If not yet, you may try again after a wait. If he finds it unsafe, it is a safety report."
            }
          ],
          [
            {
              "t": "UPS and inverter work opens only to a technician whose risky Electrician work is open."
            }
          ],
          [
            {
              "t": "If you are asked to check somebody.",
              "b": true
            },
            {
              "t": " You may say yes or no. If you say yes, be there when the work starts, check every item honestly, take photos and give your result in the app. Pechkas pays you the fee the app shows, credited against what you owe Pechkas; if Pechkas then owes you, the office pays it. If a technician you passed has a guarantee claim found against him, or an upheld safety report, on risky work within the time the app shows, it goes on your record and you are not asked to check again. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: what a checker is responsible for, and to whom.]",
              "mark": true
            }
          ],
          [
            {
              "t": "Where nobody can check yet, those kinds of job are not offered to customers. Pechkas may arrange an outside assessor instead."
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
              "t": ", you see jobs in the trades open to you and your sectors: the sector, the customer's first name, what is wrong and the price offered. Not the address or number."
            }
          ],
          [
            {
              "t": "You accept the customer's price or offer your own, within the limits the app shows, and say when you can come. You choose which jobs to offer on."
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
              "t": " If the job is bigger, send the new price in the app with the reason and a photo, once the customer has given you the start code and you have looked. Never ask for more at the door. Only the customer can decline it in the app; if she tells you no in person, tap "
            },
            {
              "t": "She said no at the door",
              "b": true
            },
            {
              "t": " and the office rings her if she does not answer."
            }
          ],
          [
            {
              "t": "The visit fee.",
              "b": true
            },
            {
              "t": " If she declines, stop: she pays you the visit fee the app showed before you offered, all of it yours, with no Pechkas fee. Collect it before you leave, then tap "
            },
            {
              "t": "I was paid",
              "b": true
            },
            {
              "t": " or "
            },
            {
              "t": "Not paid",
              "b": true
            },
            {
              "t": ". There is no visit fee when the repair goes ahead, when you did not arrive, or when the office decides the work failed because of you. On a guarantee repair, the office answers a new price, and Pechkas pays the visit fee if it says no."
            }
          ],
          [
            {
              "t": "If a customer does not pay a visit fee, the office may pay it to you from the guarantee reserve; it is taken off what you owe Pechkas. If the office waives a fee you were already paid, give it back to the customer; if you do not, Pechkas pays her and records a charge to you. You are told the amount and a date 7 days later, and you may appeal once before then in "
            },
            {
              "t": "My account",
              "b": true
            },
            {
              "t": ". Only if you do not appeal, or the office keeps the charge on appeal, is it added to what you owe; if the office cancels it, Pechkas bears the refund. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: whether Pechkas may add a waived visit fee to what you owe.]",
              "mark": true
            }
          ],
          [
            {
              "t": "Parts are charged at the shop's price, with a photo of the receipt in the app."
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
          ],
          [
            {
              "t": "Pechkas does not take gas cooker or gas oven work.",
              "b": true
            },
            {
              "t": " Decline it, even when it is posted as \"Something else\", and the office will close the job with that reason."
            }
          ],
          [
            {
              "t": "On a roof",
              "b": true
            },
            {
              "t": ", for solar panels or an outdoor unit: use a sound ladder that is held or tied, keep off wet, broken or sloping surfaces, stay back from an unguarded edge, and do not work in rain or strong wind. If it cannot be done safely, do not do it."
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Finishing, and the customer's check"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "When the work is done, tap "
            },
            {
              "t": "Work finished",
              "b": true
            },
            {
              "t": " with a photo of the finished work. You may also add a short video, "
            },
            {
              "t": "Show it working",
              "b": true
            },
            {
              "t": ". The customer sees both."
            }
          ],
          [
            {
              "t": "The job is not closed yet. The customer checks the work and taps "
            },
            {
              "t": "Yes, it works",
              "b": true
            },
            {
              "t": ", or "
            },
            {
              "t": "Not finished yet",
              "b": true
            },
            {
              "t": " with one of four reasons: "
            },
            {
              "t": "Still not working",
              "i": true
            },
            {
              "t": ", "
            },
            {
              "t": "Work left unfinished",
              "i": true
            },
            {
              "t": ", "
            },
            {
              "t": "Mess left behind",
              "i": true
            },
            {
              "t": " or "
            },
            {
              "t": "Price is not what we agreed",
              "i": true
            },
            {
              "t": ". She may add a photo and a few words."
            }
          ],
          [
            {
              "t": "If she says it is not finished, you are told her reason and see her photo and words. You may answer her in one line. Put it right, then tap "
            },
            {
              "t": "Work finished",
              "b": true
            },
            {
              "t": " again."
            }
          ],
          [
            {
              "t": "If she says it is not finished a second time, the job goes to the Pechkas office. The office looks at both sides' photos and words, and decides one of three things: the work is finished, and she pays the agreed price; it is not finished, and she pays only the visit fee; or you go back to finish it."
            }
          ],
          [
            {
              "t": "If she does not answer, the job counts as finished by itself 24 hours after you tapped "
            },
            {
              "t": "Work finished",
              "b": true
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "The customer pays you once the job is finished. The app tells you exactly what to collect."
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
              "t": "The customer pays you directly — in cash, by JazzCash or by Easypaisa — once the job is finished. The app holds no money."
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
              "t": "You owe the fee to Pechkas when the job is done. The app shows what you owe, line by line. Pay it by JazzCash, Easypaisa, bank or cash, as the app tells you. Then tap "
            },
            {
              "t": "I have paid",
              "b": true
            },
            {
              "t": " on My account with the transaction ID and a screenshot, or for cash give it to the office in person. What you owe goes down once the office has confirmed the money arrived."
            }
          ],
          [
            {
              "t": "Each fee is due 14 days after the job counts as done",
              "b": true
            },
            {
              "t": ", counted in Islamabad's days. After that you have "
            },
            {
              "t": "3 days of grace",
              "b": true
            },
            {
              "t": "; from midnight after the third, your new offers stop until it is paid. Jobs you already have go on. There is no late fee, no interest and no suspension for this. A guarantee charge, or a visit fee refund charged to you, is due the same way, counted from the day it is final. My account shows every fee with its due date, and you are reminded 3 days before, on the due date, on the last day of grace and when offers stop."
            }
          ],
          [
            {
              "t": "Payments, and money Pechkas owes you that it has not yet paid out, pay your oldest fees first. While the office checks an "
            },
            {
              "t": "I have paid",
              "b": true
            },
            {
              "t": ", that amount counts as paid for your offers, however long the check takes."
            }
          ],
          [
            {
              "t": "If your offers have stopped because a fee is overdue, the office may give you more time once, from 3 to 14 days, with its reason. Your offers stop again at midnight after the last extra day if it is still unpaid. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: whether stopping new offers for an overdue fee needs notice beyond these reminders.]",
              "mark": true
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
              "t": ", you cannot send new offers until you pay. That limit and the due dates are separate: either can stop new offers."
            }
          ],
          [
            {
              "t": "20% of each Pechkas fee is set aside as the guarantee reserve.",
              "b": true
            },
            {
              "t": " It pays for guarantee repairs that another technician has to do (see below)."
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
        "text": "If the customer does not pay you in full"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Tell Pechkas within 7 days of the job counting as done.",
              "b": true
            },
            {
              "t": " On "
            },
            {
              "t": "My account",
              "b": true
            },
            {
              "t": ", under "
            },
            {
              "t": "Not paid in full?",
              "b": true
            },
            {
              "t": ", tap "
            },
            {
              "t": "Report a payment problem",
              "b": true
            },
            {
              "t": " and choose "
            },
            {
              "t": "Not paid at all",
              "b": true
            },
            {
              "t": ", or "
            },
            {
              "t": "Paid less",
              "b": true
            },
            {
              "t": " with what you received. One report per job, and only on a job the customer pays for. You can change the amount until she answers; after that only the office can, with its reason. If you report nothing in 7 days, the fee stays as it is."
            }
          ],
          [
            {
              "t": "The Pechkas fee on that job is held from the moment you report.",
              "b": true
            },
            {
              "t": " It is taken off what you owe, and does not count towards the Rs 3,000 limit, the due dates or the reminders until it is settled."
            }
          ],
          [
            {
              "t": "Pechkas asks the customer. She answers once: that it is right, or that she has paid. If she says she has paid, or does not answer in 3 days, the office looks at it and decides, and may ask you both for proof."
            }
          ],
          [
            {
              "t": "You are only ever charged the fee on the labour you actually received",
              "b": true
            },
            {
              "t": ": what she paid you, less the parts on the job, parts first, at the same rate as the job. It is charged as money comes in — when she agrees what you received, when the office records a payment, or when you tap "
            },
            {
              "t": "I have now been paid in full",
              "b": true
            },
            {
              "t": " — and each part is due 14 days after it is charged, as above. If the office closes the question unpaid, you are charged only on what you received. Pechkas pays you nothing for a job that was not paid."
            }
          ],
          [
            {
              "t": "A report must be true. If the office finds that a report was false, that is recorded and looked at, like any other flag; so are three reports in 60 days. "
            },
            {
              "t": "Nothing happens automatically.",
              "b": true
            }
          ],
          [
            {
              "t": "While the question is open, a guarantee claim on that job goes to the office instead of to you, and no answer clock runs against you. The office may send another technician at Pechkas' cost, with "
            },
            {
              "t": "no charge to you",
              "b": true
            },
            {
              "t": "; hand the claim back to you under the usual rules, with a fresh 24 hours to answer; or find it not covered. A payment question is never, by itself, a reason to charge you for a guarantee repair. You are charged only if the office finds, from its own evidence, that your work failed, or you refuse a claim it hands back to you and the office finds it covered — and then under the usual rules above, with your 7 days to appeal."
            }
          ]
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "[DECIDE WITH A LAWYER: whether Pechkas may hold its fee while a payment is in question and charge it only on money received, as this agreement says, and how that fits the rest of the agreement; and who may chase an unpaid customer.]",
            "mark": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "The guarantee: what you must do"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Your work is guaranteed for "
            },
            {
              "t": "30 days if it was a repair or an installation",
              "b": true
            },
            {
              "t": ", and "
            },
            {
              "t": "7 days if it was a service",
              "b": true
            },
            {
              "t": " — cleaning, servicing, a gas top-up, descaling, clearing a drain, a virus clean-up or a check-up — from when the job counted as finished."
            }
          ],
          [
            {
              "t": "It covers the same fault coming back, and anything your work caused. It does not cover a new fault that has nothing to do with your work. A part you fitted is covered by the shop's or the maker's warranty for the part itself; the labour to take it out and fit it again is covered by the guarantee."
            }
          ],
          [
            {
              "t": "When a customer claims, you are told, and you see what she wrote and her photos or videos. "
            },
            {
              "t": "Answer within 24 hours",
              "b": true
            },
            {
              "t": ", in the app. You are reminded at 12 hours and at 20 hours. Either:"
            }
          ]
        ]
      },
      {
        "k": "ol",
        "items": [
          [
            {
              "t": "tap "
            },
            {
              "t": "I'll come",
              "b": true
            },
            {
              "t": " and choose a two-hour window that starts within 48 hours, then go and put it right. The customer checks it as she did the first time, and pays nothing for it. Or"
            }
          ],
          [
            {
              "t": "tap "
            },
            {
              "t": "This isn't my work",
              "b": true
            },
            {
              "t": " and say why. The Pechkas office then decides, from the photos and what you both wrote."
            }
          ]
        ]
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "If you do not answer in time, or miss the visit you chose, your new offers stop",
              "b": true
            },
            {
              "t": ", and Pechkas sends another technician, whom the customer chooses in the app as usual. Pechkas pays him from the guarantee reserve; the customer pays nothing."
            }
          ],
          [
            {
              "t": "You are charged for that repair",
              "b": true
            },
            {
              "t": " — but only if you did not answer, missed the visit you chose, or said it was not your work and the office found the claim was covered. The charge is what the other technician's work cost, "
            },
            {
              "t": "never more than the labour price of your original job",
              "b": true
            },
            {
              "t": ", and you are never charged for parts. If Pechkas had to pay more than that to find somebody, the difference is Pechkas' own cost."
            }
          ],
          [
            {
              "t": "A charge is not final straight away.",
              "b": true
            },
            {
              "t": " When the repair is finished you are told the amount and the date it will be added. You have 7 days: if you do not appeal, it is then added to what you owe Pechkas. To appeal, open the claim in "
            },
            {
              "t": "Guarantee claims",
              "b": true
            },
            {
              "t": ", tap "
            },
            {
              "t": "Appeal",
              "b": true
            },
            {
              "t": ", say why, and add photos if you have them. While your appeal waits, nothing is added. If the office cancels the charge, it is never added; if the office keeps it, it is added that day. The office decides once."
            }
          ],
          [
            {
              "t": "Once added, it is part of what you owe, like a Pechkas fee. If you owe more than Rs 3,000, your new offers stop until you pay, in "
            },
            {
              "t": "My account",
              "b": true
            },
            {
              "t": " through "
            },
            {
              "t": "Pay Pechkas",
              "b": true
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "Your offers come back when you tap "
            },
            {
              "t": "I'll come",
              "b": true
            },
            {
              "t": " (as long as another technician has not been booked yet), when the claim is closed, or when the office lifts the stop."
            }
          ],
          [
            {
              "t": "Two covered claims on your work in 60 days is a flag for the office to look at. Three in 90 days means the office reviews your approval. "
            },
            {
              "t": "Nothing happens automatically:",
              "b": true
            },
            {
              "t": " a person looks, and decides."
            }
          ]
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "[DECIDE WITH A LAWYER: whether Pechkas may add the cost of a guarantee repair to what you owe, and take it from what Pechkas owes you; whether you must come back and redo failed work without pay; whether 7 days is a fair time to appeal; and whether the office's decision on an appeal can be final, or what further review you have.]",
            "mark": true
          }
        ]
      },
      {
        "k": "h2",
        "text": "Doing a guarantee repair for someone else's job"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "You may see a job marked as a guarantee repair: work another technician did, which has failed within its guarantee and which he is not putting right himself. You offer on it, and the customer chooses, as for any job. The app shows the most you can ask for it. If nobody offers, the Pechkas office may raise that limit, and the job is announced again."
            }
          ],
          [
            {
              "t": "The customer pays nothing for it. Pechkas pays you",
              "b": true
            },
            {
              "t": ", from the guarantee reserve: the price is taken off what you owe Pechkas, and anything beyond that is paid to you by the office."
            }
          ],
          [
            {
              "t": "There is no Pechkas fee on a guarantee repair.",
              "b": true
            }
          ],
          [
            {
              "t": "Do the job and finish it in the app as usual. The customer checks it the same way."
            }
          ]
        ]
      },
      {
        "k": "p",
        "c": [
          {
            "t": "[DECIDE WITH A LAWYER: how and when the office pays you what is beyond what you owe.]",
            "mark": true
          }
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
        "text": "Arriving on time"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Arrive within the two hours you gave in your offer. Tap "
            },
            {
              "t": "I am on my way",
              "b": true
            },
            {
              "t": " only when you really set off, and "
            },
            {
              "t": "I have arrived",
              "b": true
            },
            {
              "t": " when you are at the door: the customer is told each time."
            }
          ],
          [
            {
              "t": "Arriving more than 30 minutes after your time begins is recorded as a "
            },
            {
              "t": "late arrival",
              "b": true
            },
            {
              "t": ". If the customer cancels because you are that late, it is recorded as your late arrival, not as her cancellation. A customer cancelling for her own reasons never counts against you."
            }
          ],
          [
            {
              "t": "If you have not tapped I have arrived 30 minutes after your time ends, a "
            },
            {
              "t": "possible no-show",
              "b": true
            },
            {
              "t": " is recorded, and you, the customer and the office are told. It counts as a no-show only once the office has checked it."
            }
          ],
          [
            {
              "t": "You can see every record about you in "
            },
            {
              "t": "My account",
              "b": true
            },
            {
              "t": ", with what the office decided, and tell the office if one is wrong. The office confirms or dismisses each one with a note you can read. "
            },
            {
              "t": "Nothing happens automatically",
              "b": true
            },
            {
              "t": ": no suspension and no charge."
            }
          ],
          [
            {
              "t": "If you are held up",
              "b": true
            },
            {
              "t": ", tap "
            },
            {
              "t": "I'm running late",
              "b": true
            },
            {
              "t": " on the job and choose when you will be there: at least 5 minutes away and no later than 2 hours after your time ends, and at most twice for a job. The customer is told at once and may wait or choose another technician. Your time and every estimate stay on record, and arriving more than 30 minutes into your time is still a late arrival."
            }
          ],
          [
            {
              "t": "If you cannot come",
              "b": true
            },
            {
              "t": ", tap "
            },
            {
              "t": "I can't come",
              "b": true
            },
            {
              "t": " before you arrive and choose the reason. The job goes straight back to other technicians and you will not see it again. More than 2 hours before your time, it is a normal withdrawal; within 2 hours, or once your time has begun, it is a "
            },
            {
              "t": "late withdrawal",
              "b": true
            },
            {
              "t": ". Once your arrival has been verified, or the customer has given you the start code, call the office instead. Pechkas decides which it is by its own clock, not your phone's."
            }
          ],
          [
            {
              "t": "If the customer chooses another technician because you are more than 30 minutes late, it is recorded as your late arrival. If she does so for her own reasons, it never counts against you; you are told and should not go."
            }
          ],
          [
            {
              "t": "[DECIDE WITH A LAWYER: what may follow repeated late arrivals, late withdrawals or confirmed no-shows, and with what notice.]",
              "mark": true
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "Checking your arrival by location"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "When you tap "
            },
            {
              "t": "I have arrived",
              "b": true
            },
            {
              "t": ", Pechkas checks your phone's location once against the customer's pin. Within the distance Pechkas sets, with a precise enough reading, your arrival is "
            },
            {
              "t": "verified",
              "b": true
            },
            {
              "t": " and the customer is told so. Your location is never followed in the background, and never shown to the customer."
            }
          ],
          [
            {
              "t": "If the check fails (too far, a weak signal, location refused), your arrival is still recorded. Tap "
            },
            {
              "t": "Check my location again",
              "b": true
            },
            {
              "t": " at the door; the customer's start code also confirms you were there. Otherwise the office looks at it and may accept or reject it, with a note you can read. Arrivals that stay unverified are counted for an office review; "
            },
            {
              "t": "nothing happens automatically",
              "b": true
            },
            {
              "t": ", and a poor signal or a wrong pin is not misconduct."
            }
          ],
          [
            {
              "t": "Faking your location, or tapping "
            },
            {
              "t": "I have arrived",
              "b": true
            },
            {
              "t": " before you are there, is misuse of the app."
            }
          ],
          [
            {
              "t": "Pechkas keeps your exact position for 90 days at most, then erases it, keeping only what the check found."
            }
          ],
          [
            {
              "t": "[DECIDE WITH A LAWYER: whether agreeing to these location checks is a condition of working through Pechkas, and how a technician may ask for a check to be looked at again.]",
              "mark": true
            }
          ]
        ]
      },
      {
        "k": "h2",
        "text": "If you cannot get in"
      },
      {
        "k": "ul",
        "items": [
          [
            {
              "t": "Call the customer first. Once your time has begun, and 15 minutes after the later of your "
            },
            {
              "t": "I have arrived",
              "b": true
            },
            {
              "t": " and the start of your time, tap "
            },
            {
              "t": "Nobody is answering",
              "b": true
            },
            {
              "t": ". If the guard will not let you in, tap "
            },
            {
              "t": "The guard will not let me in",
              "b": true
            },
            {
              "t": " as soon as your time has begun. Pechkas tells the customer; she has 10 minutes, or 10 more if she says she is coming."
            }
          ],
          [
            {
              "t": "After that you can report it. Your location is checked again; if it cannot be verified, add a photo of the gate or door taken with the app's camera (if your camera is not working, say why, and the office treats the report as unverified). The job closes. "
            },
            {
              "t": "Nothing is paid to you for the visit, and nothing is charged to the customer.",
              "b": true
            },
            {
              "t": " Pechkas keeps a record of these visits to decide later whether to pay for them."
            }
          ],
          [
            {
              "t": "The office checks every report and may confirm or reject it with a note you can read. The customer may say she was home. If you often report nobody home, the office looks into it; "
            },
            {
              "t": "nothing happens automatically",
              "b": true
            },
            {
              "t": "."
            }
          ],
          [
            {
              "t": "[DECIDE WITH A LAWYER: whether Pechkas will ever pay for a visit where nobody was home, and what may follow reports the office finds untrue.]",
              "mark": true
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
              "t": "The office looks at patterns that can mean misuse, such as repeated late arrivals or a confirmed no-show, or jobs that often close only because the customer did not check them in time. "
            },
            {
              "t": "A flag on its own changes nothing:",
              "b": true
            },
            {
              "t": " a person looks, and rings you first. The pauses under "
            },
            {
              "t": "Your first jobs in each trade",
              "i": true
            },
            {
              "t": " are the exception: they are made by rule, and you can appeal them."
            }
          ],
          [
            {
              "t": "Three late withdrawals in 60 days ask the office to review your account; so do repeated late arrivals and confirmed no-shows. The office may then ring you and, as a step short of suspension, "
            },
            {
              "t": "pause your new offers",
              "b": true
            },
            {
              "t": " for 1, 3 or 7 days. You are told, you see the reason in "
            },
            {
              "t": "My account",
              "b": true
            },
            {
              "t": ", jobs you already have go on, and the pause ends by itself. A pause never costs you money. "
            },
            {
              "t": "[DECIDE WITH A LAWYER: whether a pause needs notice first, and how you can ask for it to be looked at again.]",
              "mark": true
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
              "t": "For a customer: the checks of your jobs and your guarantee claims — the reasons, notes, photos and videos, the technician's replies and answers, and the office's decisions and notes about them."
            }
          ],
          [
            {
              "t": "For a technician: your application, your photo, your quiz results, the record of your first jobs, checks and pauses, any identity check result, and the record of any checks Pechkas staff did before."
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
              "t": " the record of what you owed Pechkas and what you paid, with your name, the job numbers and the payment references. That includes any guarantee charge to you and any payment Pechkas made to you for a guarantee repair. Pechkas has to keep its accounts; it holds nothing about any customer. Kept for "
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
              "t": "A job a technician did for a customer who still has an account stays on that customer's record, with its checks and any guarantee claim, without the technician's details."
            }
          ],
          [
            {
              "t": "For a customer:",
              "b": true
            },
            {
              "t": " a safety report you made about a technician stays on his record, without your name, so Pechkas can still keep customers safe."
            }
          ],
          [
            {
              "t": "For everyone:",
              "b": true
            },
            {
              "t": " the price record of finished jobs, which keeps the kind of job, the sector, the day and the prices, and nothing about who anybody was. Pechkas uses it to show what jobs of the same kind usually go for."
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
