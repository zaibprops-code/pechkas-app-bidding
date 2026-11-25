import type { DuoName } from './components/DuoIcon';

/**
 * The answers on Help (the owner's design, 25 November 2026): topics, each a
 * page of questions, for each side of the app.
 *
 * Every answer is a rule the app already keeps, in the words its own screens
 * use; a button's name is written **like this** so the page can show it in
 * bold, and it must be the button's real label. A number that can vary or
 * is still undecided (the credit limit and visit fee the office may set, the
 * lowest offer) is never written here: the answer points to the screen that
 * shows the real figure. The 10%, 7%, 30 and 7 days, 14 + 3 days and 24 hours
 * are locked settings, as in the terms: change them and this file in the
 * same week. `help.test.ts` checks each topic has questions, no two share a
 * question, and every **name** is a label a screen really draws.
 */

export type HelpQA = { q: string; a: string };
export type HelpTopic = { key: string; icon: DuoName; title: string; about: string; qa: HelpQA[] };

export const CUSTOMER_HELP: HelpTopic[] = [
  {
    key: 'posting',
    icon: 'jobs',
    title: 'Posting a job',
    about: 'Three steps: the problem, where, your price',
    qa: [
      {
        q: 'How do I post a job?',
        a: 'On home, tap the kind of work, or search for what you see, and choose the job. Then three steps: show us the problem with a voice note, a video, photos or a few words; put the pin on your house on the map; and say your price. Then tap **Post job**. Technicians see it and make offers.',
      },
      {
        q: 'How do I choose my price?',
        a: 'Your price is what you offer for the job. It starts at the usual Pechkas price, and once enough jobs like it have been finished you also see what most of them went for. One tap of − or + changes it by Rs 50. Each job has a lowest price, shown on the bar under it; − stops there. Technicians accept your price or ask for more, and you decide.',
      },
      {
        q: 'When will somebody come?',
        a: 'As soon as possible: there is no day to pick. Each technician says in his offer the two hours he will arrive in, and you choose. Late in the evening, after the last two-hour slot has started at 8pm, the job is for tomorrow morning.',
      },
      {
        q: 'Why must I set a pin on the map?',
        a: 'The pin tells Pechkas where the job is, and the street and sector are read from it, so you only type the house number. Pechkas works anywhere in Islamabad for now, Bahria Town and DHA included. Your street and house go only to the technician you choose, and only while the job is on. The pin is also how his arrival at your door is checked.',
      },
      {
        q: 'Can I send a voice note in Urdu?',
        a: 'Yes. Describe the fault in any language, up to one minute. You can also add a video of up to 20 seconds and up to 4 photos.',
      },
      {
        q: 'Nobody has offered. What can I do?',
        a: 'If nobody offers for a while, you are told, and your job offers two choices: raise your price by Rs 200, 500 or 1,000 (up to three times), or **Keep waiting**. A job nobody took closes at 8pm on its day; open it and tap **Book again** to post it again.',
      },
    ],
  },
  {
    key: 'offers',
    icon: 'chat',
    title: 'Offers and choosing',
    about: 'What you see, No thanks, asking again',
    qa: [
      {
        q: 'How do offers work?',
        a: 'Technicians who can do the job either accept your price or ask for more. Each offer says the price and the two hours he will arrive in, and it lasts a limited time. Choose one with a tap; the others are told.',
      },
      {
        q: 'What can I see before I choose?',
        a: 'Each offer opens his profile: his first name, years in the trade, which checks were done, jobs done, his rating (New until he has enough), jobs he has done for you, and the last things customers wrote, without their names. Never his surname or number.',
      },
      {
        q: 'What does No thanks do?',
        a: 'It turns down that one offer. He is told his offer was not taken, and he cannot offer on this job again. He can still see your other jobs.',
      },
      {
        q: 'When does he get my address?',
        a: 'Only once you choose him, and only while the job is on. Before that, technicians see the sector and your first name, never your street, house or number.',
      },
      {
        q: 'Can I ask for the same technician again?',
        a: 'Yes. Open a finished job from My jobs, Past and tap Ask him again, with his name on the button: your next job in that trade is held for him for a short time, and if he cannot take it, it goes to everyone. **Book again** posts the same job to everyone.',
      },
    ],
  },
  {
    key: 'visit',
    icon: 'pin',
    title: 'The visit',
    about: 'Start code, late, nobody home',
    qa: [
      {
        q: 'What is the start code?',
        a: 'Four numbers on your job once you have chosen a technician. Give them to him at the door, once you have seen him: they prove he is the person Pechkas sent. Never read them out on the phone.',
      },
      {
        q: 'When will he arrive?',
        a: 'In the two hours his offer named, shown on your job (for example 2–4pm). The job follows him: chosen, on his way, at your door. If he is held up, he can tell you when he will be there.',
      },
      {
        q: 'My technician is late or cannot come.',
        a: 'If he cannot come, your job goes straight back to other technicians, with everything you posted, and you are told. If he is late, open the job and tap **Find another technician**: the same job goes to others and nothing is charged. You never have to post it again.',
      },
      {
        q: 'Can I find another technician?',
        a: 'Yes, any time before he arrives: open the job and tap **Find another technician**. It is not a cancellation, and nothing is charged.',
      },
      {
        q: 'He says nobody answered the door.',
        a: 'If nobody answers, he asks Pechkas to tell you, and you can say you are coming or cancel. If he then reports it, the job closes and nothing is charged to you. If you were home, open the job within 24 hours and tap **I was home**: the office looks at both sides.',
      },
      {
        q: 'What does “arrival verified” mean?',
        a: 'When he taps that he has arrived, his phone’s location is compared with your pin. If he is near it, your job says **Technician arrival verified**. His exact location is never shown to you, and it is checked only at that moment, never followed.',
      },
      {
        q: 'Can I tell my family who is coming?',
        a: 'Yes. Once you have chosen him, tap **Family** on his card to send his name to family on WhatsApp.',
      },
    ],
  },
  {
    key: 'checking',
    icon: 'doc',
    title: 'Checking the work',
    about: 'Yes, it works, or not finished yet',
    qa: [
      {
        q: 'He says the work is finished. What now?',
        a: 'Check it before you pay. Your job shows **Yes, it works** and **Not finished yet**. If it is not finished, choose why; he is told and puts it right.',
      },
      {
        q: 'What if it is not finished?',
        a: 'Tap **Not finished yet** and choose why; add a note or a photo if it helps. He is told and puts it right. If you say so a second time, the Pechkas office looks at both sides’ photos and decides.',
      },
      {
        q: 'What if I do nothing?',
        a: 'You are reminded. If you do not answer within 24 hours, the work counts as finished, and your guarantee starts then.',
      },
      {
        q: 'Where is his note for me?',
        a: 'If he left one, for example how to look after the repair, it is on the finished job’s page: open it from My jobs, Past.',
      },
    ],
  },
  {
    key: 'prices',
    icon: 'tag',
    title: 'Prices and fees',
    about: 'A higher price, the visit fee, parts',
    qa: [
      {
        q: 'He asks for a higher price. What now?',
        a: 'He can only ask once you have given him the start code and he has looked, with a reason and a photo. Nothing changes unless you approve. If you decline, the job stops there and you pay only the visit fee, which the job shows before you choose him.',
      },
      {
        q: 'When do I pay a visit fee?',
        a: 'Only when the technician came, looked, asked a new price, and you said no. Never when the repair goes ahead, never if he does not arrive, and never for a guarantee visit. If you think a fee is wrong, open the job and tap **I disagree with this fee** within 24 hours.',
      },
      {
        q: 'Why is the visit fee shown before I choose?',
        a: 'So you know it before anybody comes. You pay it only if he came, looked, asked a new price and you said no.',
      },
      {
        q: 'What is the usual price?',
        a: 'The usual Pechkas price for that job, shown when you choose it. A few jobs say After a look: the technician has to see them first.',
      },
      {
        q: 'What does “in line with most jobs” mean?',
        a: 'Once enough jobs like yours have been finished on Pechkas in the last 90 days, Your price shows what most of them went for, for the work only, and whether your price is in line with, below or above it. It is a guide; you still choose.',
      },
      {
        q: 'Are parts extra?',
        a: 'What you pay is the price agreed on your job. If he finds he needs parts he did not expect, he asks for a new price with a photo, and nothing changes unless you approve.',
      },
    ],
  },
  {
    key: 'paying',
    icon: 'wallet',
    title: 'Paying',
    about: 'Cash or wallet, receipts, a payment question',
    qa: [
      {
        q: 'How do I pay?',
        a: 'Straight to the technician, in cash or by JazzCash or Easypaisa, once you have checked the work. Your job shows the amount. Pechkas never asks you to pay inside the app.',
      },
      {
        q: 'Can I share a receipt?',
        a: 'Yes. Open the finished job from My jobs, Past and tap **Share receipt**. It shares what you paid and for what, in plain words, without your address or any number.',
      },
      {
        q: 'Pechkas asks me about a payment.',
        a: 'The technician has told Pechkas he was not paid in full. Open the job and answer once: That’s right, if you still owe it, or I have paid, with a few words and a screenshot if you have one. If you say that is right, you cannot post a new job until it is paid. If you say you paid, or do not answer in 3 days, the Pechkas office looks at it, and you can post jobs meanwhile. Your guarantee is not affected.',
      },
      {
        q: 'I disagree with a visit fee.',
        a: 'Open the job within 24 hours and tap **I disagree with this fee**, or **I have paid him** if you already did. The Pechkas office looks at it.',
      },
    ],
  },
  {
    key: 'guarantee',
    icon: 'shield',
    title: 'Guarantee',
    about: 'How long, and when it fails again',
    qa: [
      {
        q: 'How long is my guarantee?',
        a: '30 days for repairs and installations, 7 days for services such as cleaning and servicing. It starts when the work counts as finished, and the job shows its end date.',
      },
      {
        q: 'It has failed again. What now?',
        a: 'Open the job from My jobs, Past. While it is guaranteed, tap **It has failed again**, describe it and add a photo or video. He has 24 hours to answer and must come back within 48 hours. If he does not, Pechkas sends another technician and pays for the repair.',
      },
      {
        q: 'What if he does not come back?',
        a: 'If he does not answer within 24 hours, or misses the visit, your claim lets you book another technician. Pechkas pays for that repair.',
      },
      {
        q: 'Do I pay for putting it right?',
        a: 'No. A repair under the guarantee costs you nothing, whether he comes back or Pechkas sends somebody else.',
      },
      {
        q: 'Where do I see the days left?',
        a: 'In My jobs, Past: jobs still under guarantee are at the top, with the days left.',
      },
    ],
  },
  {
    key: 'cancelling',
    icon: 'clock',
    title: 'Cancelling',
    about: 'Always free, at the door, after the code',
    qa: [
      {
        q: 'Can I cancel a job?',
        a: 'Yes, and it is always free. Open the job from My jobs and tap **Cancel this job**.',
      },
      {
        q: 'Does cancelling cost anything?',
        a: 'No, never: cancelling never creates a visit fee. If he is more than 30 minutes late, cancelling never counts against you.',
      },
      {
        q: 'Can I cancel with him at the door?',
        a: 'Yes, until you give him the start code: tap **I no longer need this service**. It is still free.',
      },
      {
        q: 'I have given him the start code.',
        a: 'Then you cannot cancel it yourself. Tap **Write to the office** on the job: the office can stop it, and no fee is charged.',
      },
    ],
  },
  {
    key: 'safety',
    icon: 'lock',
    title: 'Safety',
    about: 'Emergency, the face check, reporting',
    qa: [
      {
        q: 'What if I feel unsafe?',
        a: 'If anyone is in danger, call the emergency numbers first: they are under Safety in the menu. During a job, the **Emergency** button tells the Pechkas office straight away, then sends where you are.',
      },
      {
        q: 'Is this the man Pechkas sent?',
        a: 'When he has a photo on Pechkas, your job shows it at the door. If it is somebody else, tap **No, it is somebody else** and do not let him in: the job goes back to other technicians, Pechkas is told, and you pay nothing.',
      },
      {
        q: 'How do I report something unsafe?',
        a: 'During a job, tap **Report** on his card. Afterwards, open the job from My jobs, Past and tap **Report something unsafe**. The Pechkas office reads every report and answers you in writing, in the app.',
      },
      {
        q: 'Can I stop a technician being sent again?',
        a: 'Yes. Once a job is over, open it and tap Never send me, with his name. He will not see your jobs again, and he is never told.',
      },
      {
        q: 'Where are the emergency numbers?',
        a: 'Open the menu and tap Safety. Tap a number to call it. The page works even when you are signed out.',
      },
    ],
  },
  {
    key: 'account',
    icon: 'settings',
    title: 'Your account',
    about: 'Name, number, addresses, deleting',
    qa: [
      {
        q: 'How do I change my name?',
        a: 'Open Settings from the menu and tap the pencil on your initial. Technicians only ever see your first name.',
      },
      {
        q: 'How do I change my number?',
        a: 'Settings shows your number. If it says **Change**, tap it and type the new one. If it says **Checked**, it is the number you sign in with, and it cannot be changed in the app.',
      },
      {
        q: 'Where are my saved addresses?',
        a: 'In Settings, under **Saved addresses**. They are kept on this phone only, so Post a job can fill them in, and signing out forgets them. To save one, choose Home, Office or Other when you post a job.',
      },
      {
        q: 'How do notifications work?',
        a: 'Pechkas tells you about offers, your technician and your job. Notifications in the menu shows what you were told in the last 90 days; tap one to open its job.',
      },
      {
        q: 'How do I become a technician too?',
        a: 'Open the menu and tap **Technician mode** at the foot. You fill in an application first; your customer account stays as it is.',
      },
      {
        q: 'How do I reach the office?',
        a: 'Only in the app: the office never calls and is not on WhatsApp. In Help, tap **Write to the office**, choose the job it is about, and write. It answers there, 7am to 10pm, and you are told when it does; an answer about a job is on the job too.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Open Settings and tap **Delete my account**. It deletes your name, your number, your jobs, voice notes, videos and photos. It cannot be undone.',
      },
    ],
  },
];

export const TECHNICIAN_HELP: HelpTopic[] = [
  {
    key: 'start',
    icon: 'briefcase',
    title: 'Getting started',
    about: 'Approval, your photo, the rules quiz',
    qa: [
      {
        q: 'How am I approved?',
        a: 'By the app’s rules, not by a person. Before your first job: your number checked by SMS, your photo, and the rules quiz when it is open. When all of these are done, the app approves you by itself, within ten minutes. My account, **Your first jobs** shows each step.',
      },
      {
        q: 'Why do I need a photo of my face?',
        a: 'Customers see it before they choose you, and confirm it is you at the door before giving you the start code. You can retake it until your first job; after that it is locked, and you can ask to change it from Your first jobs.',
      },
      {
        q: 'What is the rules quiz?',
        a: 'A short quiz on how Pechkas works. When it is open, take it from Your first jobs. While it is not open, there is nothing to do.',
      },
      {
        q: 'Can I change my trades or sectors?',
        a: 'Only before you are approved. After that, write to the office in the app: Help, then **Write to the office**.',
      },
    ],
  },
  {
    key: 'first',
    icon: 'star',
    title: 'Your first jobs',
    about: 'Three trial jobs, the price limit',
    qa: [
      {
        q: 'What are my first jobs?',
        a: 'Your first 3 jobs in each trade are your trial, and customers see “New on Pechkas” on your offer. On them you take basic jobs only, one job at a time. You stay on these limits until your identity can be verified through an identity service; that service is not available yet.',
      },
      {
        q: 'What is the price limit on a first job?',
        a: 'Your work may come to no more than the limit Pechkas sets, shown when you make an offer. Parts with a shop receipt are not counted. If the customer agrees to a price above it, the job goes ahead but does not count toward your 3 first jobs.',
      },
      {
        q: 'When does a first job count?',
        a: 'Each customer answers four questions: on time, explained the work, left it clean, it works. All four yes, with your photos, no guarantee claim or payment problem, and the Pechkas fee on it paid, and the job counts.',
      },
      {
        q: 'What is risky work?',
        a: 'Work such as wiring, gas geysers and AC gas. It also needs another Pechkas technician to check one of your jobs before it opens to you.',
      },
    ],
  },
  {
    key: 'offers',
    icon: 'jobs',
    title: 'Finding jobs and offers',
    about: 'Online, offers, saying when you come',
    qa: [
      {
        q: 'How do I go online?',
        a: 'Tap the switch at the top of Jobs. While you are online you see jobs in your trades and sectors and are told about new ones. It stays on until you switch it off.',
      },
      {
        q: 'How do I make an offer?',
        a: 'Tap a job, then accept her price, or ask for more in steps of Rs 200, 500 or 1,000, or with − and +. Choose the two hours you will arrive in, add a note if you like (no phone numbers) and send. The offer lasts a limited time, and you can change it while it waits.',
      },
      {
        q: 'How do I say when I will come?',
        a: 'Every offer names two hours on the customer’s day, from 8–10am to 8–10pm. When she chooses you, those two hours are your time, and lateness is counted from their start.',
      },
      {
        q: 'What does “Asked for you” mean?',
        a: 'The customer asked for you again. The job is held for you alone for a short time; if you cannot take it, pass it and it goes to everyone.',
      },
      {
        q: 'Why can I not make offers?',
        a: 'While what you owe is over your limit, or a fee is past its grace days, new offers stop until you pay; My account then says so. They also stop while a guarantee claim on your work is left unanswered: answer it under Guarantee claims. The office can also pause your new offers for a few days, with its reason; jobs you already have go on, and the pause ends by itself.',
      },
    ],
  },
  {
    key: 'door',
    icon: 'pin',
    title: 'At the door',
    about: 'Start code, location, nobody home',
    qa: [
      {
        q: 'What is the start code?',
        a: 'Four numbers the customer gives you at the door. Type them to start the work: they prove you are the person Pechkas sent. Wrong tries are counted, and too many lock it until the office unlocks it.',
      },
      {
        q: 'Why does Pechkas check my location?',
        a: 'Only twice, and only when you tap: **I have arrived**, and a nobody-home report. Pechkas compares where your phone is with the customer’s pin, so a real arrival is shown to the customer as verified. It never follows you in the background. If the check fails (a weak signal, a wrong pin), check your location again at the door; the start code also confirms you were there, and nothing happens to you automatically.',
      },
      {
        q: 'The customer is asked about my photo.',
        a: 'When you arrive, she sees your photo and confirms it is you before giving you the start code. If she says it is somebody else, the job goes back to other technicians and your trades are paused while Pechkas looks at it; you can write your side.',
      },
      {
        q: 'Nobody answers at the door.',
        a: 'Call the customer first. 15 minutes after you tapped **I have arrived** (and once your time has begun), tap **Nobody is answering**: Pechkas tells her, and she has 10 minutes, or 10 more if she says she is coming. Then you can report it. Your location is checked again; if it cannot be verified, add a photo of the gate or door. The job closes, and the office checks every report. Nothing is charged or paid.',
      },
      {
        q: 'The guard will not let me in.',
        a: 'Once your time has begun, tap **The guard will not let me in** straight away. Pechkas tells the customer, and she has 10 minutes, or 10 more if she says she is coming. Then you can report it. A guard report never counts against either of you.',
      },
    ],
  },
  {
    key: 'work',
    icon: 'camera',
    title: 'Doing the work',
    about: 'Photos, a new price, parts, your note',
    qa: [
      {
        q: 'Why are photos needed to start and finish?',
        a: 'They are the record of the job: how it was when you started and how you left it. They must be your own, taken for this job. If the customer says it is not finished, or claims the guarantee, they protect you. A short video of it working at the finish helps too.',
      },
      {
        q: 'The job needs more than the agreed price.',
        a: 'Once the customer has given you the start code and you have looked, tap **Request a new price** and send the reason and a photo. The price changes only if the customer approves. If they decline, the job stops there and they pay you the visit fee, all of it yours. On a guarantee repair the Pechkas office answers instead.',
      },
      {
        q: 'How do parts with a receipt work?',
        a: 'When you finish, add the amount spent on parts and a photo of the shop receipt. The Pechkas fee is on your labour only: the price less those parts.',
      },
      {
        q: 'Can I leave the customer a note?',
        a: 'Yes, when you tap **Work finished**, or within a day of the job ending: up to 300 letters, no phone numbers. She reads it on the job’s page once it is over.',
      },
    ],
  },
  {
    key: 'finish',
    icon: 'doc',
    title: 'Finishing',
    about: 'Work finished, the customer’s check',
    qa: [
      {
        q: 'What happens after Work finished?',
        a: 'The customer is asked to check it: Yes, it works, or Not finished yet. If she does not answer within 24 hours, it counts as finished. The Pechkas fee and the guarantee start from then.',
      },
      {
        q: 'The customer says it is not finished.',
        a: 'Your job shows their reason and any photo. Put it right, take a new photo and tap **Work finished** again; you can answer them in one line. If they say it twice, Pechkas looks at both sides’ photos and decides. A short video of it working at the finish protects you.',
      },
      {
        q: 'When does a job count as done?',
        a: 'When the customer taps Yes, it works, when 24 hours pass with no answer, or when the Pechkas office decides a disagreement.',
      },
    ],
  },
  {
    key: 'paid',
    icon: 'wallet',
    title: 'Getting paid',
    about: 'What to collect, a customer who did not pay',
    qa: [
      {
        q: 'How am I paid?',
        a: 'The customer pays you directly once they have checked the work. Pechkas never holds the money.',
      },
      {
        q: 'What do I collect?',
        a: 'Your job shows the amount to collect. If no price has been agreed, it shows no figure: tap **Write to the office** before you take any money.',
      },
      {
        q: 'The customer did not pay me in full.',
        a: 'Up to 7 days after the job counts as finished, open My account and tap **Report a payment problem**: Not paid at all, or Paid less with what you received. Pechkas asks the customer, and your commission on that job is held, so it counts towards nothing you owe. When you are paid the rest, tap **I have now been paid in full**. Commission is only ever charged on the work you were actually paid for.',
      },
      {
        q: 'The customer declined a new price.',
        a: 'The job stops and they pay you only the visit fee, which is all yours: Pechkas takes nothing from it. Collect it before you leave, then tap **I was paid** or **Not paid**.',
      },
    ],
  },
  {
    key: 'owe',
    icon: 'tag',
    title: 'What you owe Pechkas',
    about: '10% or 7%, due dates, I have paid',
    qa: [
      {
        q: 'How much is the Pechkas fee?',
        a: '10% of the labour, which is the price less any parts bought with a shop receipt, or 7% when you finished a job for the same customer in the 12 months before they chose you. Nothing on a visit fee. Every job shows the rate before you offer.',
      },
      {
        q: 'How do I pay what I owe?',
        a: 'My account shows what you owe, each fee’s due date and where to send the money. After paying, tap **I have paid** there and add the transaction number and a screenshot. It counts at once, and each transaction number can be used only once. If the money does not reach Pechkas, the office can correct it within 30 days. If that happens twice within 90 days, your new offers are paused until the office lifts the pause; you can write to Pechkas about it in the app.',
      },
      {
        q: 'When is a fee due?',
        a: '14 days after the job, with 3 days of grace. After that your new offers stop until it is paid; jobs you already have go on. There is no fee or interest for paying late.',
      },
      {
        q: 'Is there a launch rate, and what is my code?',
        a: 'If you applied before the cut-off day, the Pechkas fee is 5% of the labour instead of 10% (or 7%), from your 3rd good first job in a trade until 90 days after that trade is approved. My account shows your rate and its last day, and every job shows it before you offer. Once you are approved you also get a code there. When a technician you told applies with it, and his first 3 jobs count and are paid, Pechkas takes an amount off what you owe, for at most a few technicians; My account shows both. It is never paid in cash.',
      },
    ],
  },
  {
    key: 'claims',
    icon: 'shield',
    title: 'Guarantee claims',
    about: 'Answering, a charge, appealing',
    qa: [
      {
        q: 'A guarantee claim on my work.',
        a: 'Open Guarantee claims from the menu. Answer within 24 hours: **I’ll come**, with a time within 48 hours, or **This isn’t my work**, with a reason for Pechkas to decide.',
      },
      {
        q: 'What if I do not answer?',
        a: 'Your new offers stop, and the customer can book another technician. They start again when you answer (until she books) or the claim closes. The cost of that repair may be charged to you, never more than your labour on the job, and never the parts.',
      },
      {
        q: 'Can I appeal a charge?',
        a: 'Yes. You are told the amount and the date first, and you have 7 days to appeal before it is added to what you owe. While your appeal waits, nothing is added; the office decides.',
      },
    ],
  },
  {
    key: 'late',
    icon: 'clock',
    title: 'Late and cannot come',
    about: 'Running late, I can’t come, your record',
    qa: [
      {
        q: 'What if I am late?',
        a: 'Arriving more than 30 minutes after your time begins is recorded as late, and not arriving at all is checked by the office. If you are held up, tap I’m running late on the job and say when you will be there. Nothing happens on its own.',
      },
      {
        q: 'I can’t come. What happens?',
        a: 'Tap I can’t come on the job before you arrive, with the reason. The same job goes back to other technicians and the customer is told. More than 2 hours before your time it is a normal withdrawal; within 2 hours, or after your time began, it is recorded as a late withdrawal.',
      },
      {
        q: 'Where do I see my record?',
        a: 'My account, **Arriving on time**: late arrivals, no-shows and nobody-home reports, with the office’s notes. You can tell the office if one is wrong.',
      },
    ],
  },
  {
    key: 'account',
    icon: 'settings',
    title: 'Your account',
    about: 'Number, modes, deleting',
    qa: [
      {
        q: 'How do I change my number?',
        a: 'A number checked by SMS is the one you sign in with, and it cannot be changed in the app. If you signed up with email, Your first jobs asks you to check a number by SMS.',
      },
      {
        q: 'How do I switch to customer mode?',
        a: 'Open the menu and tap **Customer mode** at the foot. You cannot switch in the middle of a job. Switching takes you off duty: you go offline and your waiting offers are withdrawn.',
      },
      {
        q: 'How do I reach the office?',
        a: 'Only in the app: the office never calls and is not on WhatsApp. In Help, tap **Write to the office**, or tap **Report** on a job. It answers in writing, 7am to 10pm, and you are told when it does; an answer about a job is on the job too.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Open Settings and tap **Delete my account**. It cannot be undone.',
      },
    ],
  },
];

/** Splits "Tap **Cancel this job** now" into plain and bold parts. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text.split(/\*\*(.+?)\*\*/g).map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text);
}

/**
 * How a typed word is matched: a short one (three letters or fewer) is a
 * whole word, so "fee" finds "fee" and "fees" but never "feel"; a longer one
 * may start a word, so "visi" already finds "visit". The page marks the same.
 * (No look-behind in a pattern: not every phone's JavaScript has it.)
 */
export function wordMatches(typed: string, word: string): boolean {
  const t = typed.toLowerCase().replace(/[^a-z0-9]/g, '');
  const w = word.toLowerCase();
  if (!t) return false;
  return t.length <= 3 ? w === t || w === `${t}s` || w === `${t}es` : w.startsWith(t);
}

const wordsOf = (text: string) => text.toLowerCase().replace(/\*\*/g, '').match(/[a-z0-9]+/g) ?? [];

/** The answers whose question, answer or topic holds every word typed, best first. */
export function searchHelp(topics: HelpTopic[], typed: string): { topic: HelpTopic; qa: HelpQA }[] {
  const words = typed.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const found: { topic: HelpTopic; qa: HelpQA; score: number }[] = [];
  for (const topic of topics) {
    for (const qa of topic.qa) {
      const q = wordsOf(qa.q);
      const all = [...q, ...wordsOf(qa.a), ...wordsOf(topic.title), ...wordsOf(topic.about)];
      if (!words.every((w) => all.some((x) => wordMatches(w, x)))) continue;
      found.push({ topic, qa, score: words.filter((w) => q.some((x) => wordMatches(w, x))).length });
    }
  }
  return found.sort((a, b) => b.score - a.score);
}
