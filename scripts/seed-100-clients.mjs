import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore, doc, getDoc, collection,
  writeBatch, serverTimestamp, Timestamp
} from 'firebase/firestore'
import fs from 'fs'

function loadEnv() {
  const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env.development'
  if (!fs.existsSync(envPath)) return {}
  const content = fs.readFileSync(envPath, 'utf8')
  const env = {}
  content.split('\n').forEach(line => {
    line = line.trim()
    if (!line || line.startsWith('#')) return
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      let val = match[2].trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      env[match[1].trim()] = val
    }
  })
  return env
}

const env = loadEnv()
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const auth = getAuth(app)
const db = getFirestore(app)

const FIRST_NAMES = [
  'Aadhav', 'Abhinav', 'Aditya', 'Ajay', 'Akash', 'Amrit', 'Anand', 'Anirudh', 'Aravind', 'Ashwin',
  'Balaji', 'Bharat', 'Chaitanya', 'Deepak', 'Dhanush', 'Dinesh', 'Ganesh', 'Gautam', 'Gokul', 'Hari',
  'Harish', 'Hemanth', 'Jayant', 'Kalyan', 'Karthik', 'Kaushik', 'Keshav', 'Kishore', 'Krishna', 'Madhav',
  'Manoj', 'Mithun', 'Mukesh', 'Naveen', 'Nikhil', 'Nithin', 'Pavan', 'Pranav', 'Prashanth', 'Praveen',
  'Rahul', 'Rajesh', 'Rakesh', 'Ramesh', 'Rohan', 'Rohit', 'Sachin', 'Sai', 'Sanjay', 'Santosh',
  'Saravanan', 'Sathish', 'Senthil', 'Shankar', 'Shiva', 'Siddharth', 'Srikanth', 'Srinivas', 'Subhash', 'Sudhir',
  'Sundar', 'Suresh', 'Surya', 'Tarun', 'Tejas', 'Uday', 'Varun', 'Venkatesh', 'Vignesh', 'Vijay',
  'Vikram', 'Vinay', 'Vishal', 'Vishnu', 'Vivek', 'Yash', 'Yogesh', 'Yuvan', 'Zaid', 'Aamir',
  'Aishwarya', 'Ananya', 'Anushka', 'Bhavana', 'Deepa', 'Divya', 'Gayathri', 'Harini', 'Janani', 'Kavitha',
  'Keerthi', 'Lakshmi', 'Lavanya', 'Madhavi', 'Meera', 'Monika', 'Nandini', 'Nithya', 'Pooja', 'Priya'
]

const LAST_NAMES = [
  'Iyer', 'Iyengar', 'Rajan', 'Kumar', 'Sundaram', 'Krishnan', 'Natarajan', 'Subramanian', 'Balaji', 'Venkat',
  'Srinivasan', 'Ranganathan', 'Chandran', 'Swaminathan', 'Murugan', 'Thangavel', 'Ganesan', 'Pillai', 'Menon', 'Nair',
  'Reddy', 'Choudhary', 'Verma', 'Sharma', 'Patel', 'Gupta', 'Sinha', 'Mukherjee', 'Banerjee', 'Rao'
]

const EVENT_TEMPLATES = [
  { prefix: 'Grand Wedding of', type: 'wedding', custom: '' },
  { prefix: 'Traditional Muhurtham of', type: 'wedding', custom: '' },
  { prefix: 'Pre-Wedding Romance Shoot for', type: 'preWedding', custom: '' },
  { prefix: 'Engagement Ceremony of', type: 'engagement', custom: '' },
  { prefix: 'Ring Exchange & Reception of', type: 'engagement', custom: '' },
  { prefix: '1st Birthday Grand Celebration of Baby', type: 'birthday', custom: '' },
  { prefix: 'Sweet 16 Milestone of', type: 'birthday', custom: '' },
  { prefix: 'Baby Shower & Seemantham of', type: 'babyShower', custom: '' },
  { prefix: 'Traditional Valaikappu of', type: 'babyShower', custom: '' },
  { prefix: 'Half-Saree & Dhavani Function of', type: 'puberty', custom: '' },
  { prefix: 'Rithu Sadangu Ceremony of', type: 'puberty', custom: '' },
  { prefix: 'Corporate Annual Tech Gala', type: 'corporate', custom: '' },
  { prefix: 'Product Launch & Keynote', type: 'corporate', custom: '' },
  { prefix: 'Startup Conclave & Demo Day', type: 'corporate', custom: '' },
  { prefix: 'School Annual Day Extravaganza', type: 'schoolEvent', custom: '' },
  { prefix: 'Graduation & Convocation Ceremony', type: 'schoolEvent', custom: '' },
  { prefix: 'Inter-School Sports Meet Coverage', type: 'schoolEvent', custom: '' },
  { prefix: 'Executive Leadership Headshots', type: 'portrait', custom: '' },
  { prefix: 'Fashion Model Lookbook Session', type: 'portrait', custom: '' },
  { prefix: 'Commercial Apparel Studio Shoot', type: 'studio', custom: '' },
  { prefix: 'Jewellery Collection Product Shoot', type: 'studio', custom: '' },
  { prefix: 'Grahapravesam Housewarming of', type: 'other', custom: 'Grahapravesam Housewarming' },
  { prefix: 'Upanayanam Sacred Thread Ceremony of', type: 'other', custom: 'Upanayanam Sacred Thread' },
  { prefix: 'Sashtiabadhapoorthi 60th Birthday of', type: 'other', custom: '60th Sashtiabadhapoorthi' },
  { prefix: 'Sadabhishekam 80th Milestone of', type: 'other', custom: '80th Sadabhishekam' },
  { prefix: 'Bharatanatyam Arangetram of', type: 'other', custom: 'Dance Arangetram' },
]

const VENUES = [
  'Mayor Ramanathan Chettiar Hall, RA Puram',
  'ITC Grand Chola, Guindy',
  'The Leela Palace, MRC Nagar',
  'Taj Coromandel, Nungambakkam',
  'Hyatt Regency, Teynampet',
  'Feathers Hotel, Manapakkam',
  'Green Meadows Resort, Palavakkam',
  'VGP Golden Beach Resort, ECR',
  'Blue Lagoon Beach Resort, Neelankarai',
  'Rani Meyyammai Hall, Egmore',
  'Smt. Sivagami Pethachi Auditorium, Mylapore',
  'Karpagam Gardens, Adyar',
  'Kamakshi Kalyana Mandapam, T Nagar',
  'Woodlands Symphony Hall, Royapettah',
  'Chennai Trade Centre, Nandambakkam',
  'OMR Express IT Corridor, Sholinganallur',
  'Studio Zoom In-House Studio, Anna Nagar',
  'EVP World Film City, Chembarambakkam',
  'Taj Fisherman’s Cove Resort & Spa, Kovalam',
  'InterContinental Chennai Mahabalipuram Resort',
  'Radisson Blu Resort Temple Bay, Mamallapuram',
  'Kallidaikurichi Palace Hall, Alwarpet',
  'Sri Krishna Gana Sabha, T Nagar',
  'Music Academy Main Auditorium, TTK Road',
  'Chettinad House, RA Puram',
]

const PACKAGES = [
  { name: 'Gold Wedding Elite', price: 150000 },
  { name: 'Platinum Royal Heritage', price: 220000 },
  { name: 'Silver Essential', price: 85000 },
  { name: 'Diamond Ultra Cinematic', price: 350000 },
  { name: 'Classic Portrait Package', price: 25000 },
  { name: 'Premium Birthday Coverage', price: 40000 },
  { name: 'Corporate Standard Package', price: 65000 },
  { name: 'Half-Day Studio Session', price: 18000 },
  { name: 'Custom Package', price: 50000 },
  { name: 'Full Day Commercial Shoot', price: 95000 },
  { name: 'Multi-Camera Drone Live Stream', price: 120000 },
]

const STAGES = ['booked', 'planning', 'preProduction', 'eventDay', 'postProduction', 'delivered']
const START_TIMES = ['06:00', '07:30', '08:30', '09:00', '10:00', '15:30', '16:00', '18:00', '18:30']
const END_TIMES   = ['11:30', '13:00', '14:00', '17:00', '20:30', '21:00', '22:30', '23:00']

async function seed100() {
  console.log('🌱 Starting Seeding of 100 Extra Diverse Records...')
  const cred = await signInWithEmailAndPassword(auth, 'admin@studiozoom.in', 'StudioZoom@2026')
  const uid = cred.user.uid
  console.log('✅ Authenticated as Admin:', uid)

  let nextNum = 200
  const numSnap = await getDoc(doc(db, 'studioSettings', 'numberingConfig'))
  if (numSnap.exists()) {
    nextNum = numSnap.data().invoiceStartNumber ?? 200
  }

  const CHUNK_SIZE = 10
  const TOTAL_COUNT = 100

  for (let i = 0; i < TOTAL_COUNT; i += CHUNK_SIZE) {
    const batch = writeBatch(db)

    for (let j = 0; j < CHUNK_SIZE; j++) {
      const idx = i + j
      const clientRef  = doc(collection(db, 'clients'))
      const projectRef = doc(collection(db, 'projects'))

      const firstName1 = FIRST_NAMES[(idx * 7) % FIRST_NAMES.length]
      const firstName2 = FIRST_NAMES[(idx * 11 + 3) % FIRST_NAMES.length]
      const lastName   = LAST_NAMES[(idx * 13) % LAST_NAMES.length]
      const clientName = `${firstName1} ${lastName}`
      const contact    = `+9198${String(40000000 + idx * 48721).slice(0, 8)}`
      const email      = `${firstName1.toLowerCase()}.${lastName.toLowerCase()}${idx}@gmail.com`

      const template = EVENT_TEMPLATES[idx % EVENT_TEMPLATES.length]
      const eventType = template.type
      const customEventType = template.custom

      let eventName = `${template.prefix} ${firstName1}`
      if (['wedding', 'preWedding', 'engagement'].includes(eventType)) {
        eventName = `${firstName1} & ${firstName2} (${template.prefix.replace(' of', '').replace('Grand ', '')})`
      } else if (['corporate', 'schoolEvent', 'studio'].includes(eventType)) {
        eventName = `${template.prefix} #${idx + 101}`
      }

      // Booking Type distribution: 65% oneTime, 25% multiDate, 10% recurring
      let bookingType = 'oneTime'
      if (idx % 4 === 1) bookingType = 'multiDate'
      else if (idx % 10 === 7) bookingType = 'recurring'

      // Dates: spanning from April 2026 to March 2028
      const monthOffset = (idx % 24) - 5
      const dayOffset = (idx % 27) + 1
      const d = new Date(2026, 8 + monthOffset, dayOffset, 9, 0, 0)
      const eventDate = Timestamp.fromDate(d)

      const startTime = START_TIMES[idx % START_TIMES.length]
      const endTime   = END_TIMES[idx % END_TIMES.length]
      const venue     = VENUES[idx % VENUES.length]
      const pkg       = PACKAGES[idx % PACKAGES.length]
      const totalAmount = pkg.price

      // Multi-date sub-dates
      let eventDates = []
      if (bookingType === 'multiDate') {
        const numDays = (idx % 3) + 2
        const labels = ['Mehendi', 'Sangeet', 'Muhurtham', 'Reception', 'Haldi', 'Nalangu', 'Maruveedu', 'Cocktail Night']
        for (let day = 0; day < numDays; day++) {
          const subD = new Date(d.getTime() + day * 86400000)
          eventDates.push({
            id: `sub_${idx}_${day}`,
            label: labels[(idx + day) % labels.length],
            date: Timestamp.fromDate(subD),
            startTime: START_TIMES[(idx + day) % START_TIMES.length],
            endTime: END_TIMES[(idx + day) % END_TIMES.length],
            location: VENUES[(idx + day) % VENUES.length],
          })
        }
      }

      // Recurring schedule
      let recurringSchedule = null
      if (bookingType === 'recurring') {
        const totalSessions = ((idx % 4) + 1) * 3
        const endD = new Date(d.getTime() + totalSessions * 30 * 86400000)
        recurringSchedule = {
          frequency: idx % 2 === 0 ? 'monthly' : 'biweekly',
          startDate: Timestamp.fromDate(d),
          endDate: Timestamp.fromDate(endD),
          totalSessions,
          perSessionRate: Math.round(totalAmount / totalSessions),
          paymentType: idx % 2 === 0 ? 'custom' : 'perSession',
          sessionStartTime: startTime,
          sessionEndTime: endTime,
        }
      }

      // Payment Status: 35% paid, 45% partial, 20% unpaid
      let advanceAmount = 0
      let paymentStatus = 'unpaid'
      if (idx % 10 < 3) {
        advanceAmount = totalAmount
        paymentStatus = 'paid'
      } else if (idx % 10 < 8) {
        advanceAmount = Math.round(totalAmount * ((idx % 3 + 2) / 10))
        paymentStatus = 'partial'
      } else {
        advanceAmount = 0
        paymentStatus = 'unpaid'
      }
      const balanceDue = Math.max(0, totalAmount - advanceAmount)

      // Stage
      let stage = STAGES[idx % STAGES.length]
      if (d < new Date() && paymentStatus === 'paid') stage = 'delivered'

      const invoiceNo = `ZS-INV-2026-${String(nextNum + idx).padStart(4, '0')}`

      // Client Doc
      const clientDocData = {
        clientId:        clientRef.id,
        projectId:       projectRef.id,
        name:            clientName,
        contact,
        email,
        eventName,
        eventType,
        customEventType,
        eventDate,
        startTime,
        endTime,
        location:        venue,
        notes:           `Seeded record #${idx + 1}. Comprehensive requirements and rider preferences recorded.`,
        bookingType,
        eventDates,
        ...(recurringSchedule ? { recurringSchedule } : {}),
        packageType:     pkg.name,
        totalAmount,
        balanceDue,
        paymentStatus,
        invoiceNumber:   invoiceNo,
        status:          'booked',
        stage,
        isDeleted:       false,
        createdBy:       uid,
        createdAt:       Timestamp.fromDate(new Date(2026, 6, 1 + (idx % 28))),
        updatedAt:       serverTimestamp(),
      }

      batch.set(clientRef, clientDocData)

      // Payment subcollection doc
      if (advanceAmount > 0) {
        const payRef = doc(collection(db, 'clients', clientRef.id, 'payments'))
        batch.set(payRef, {
          paymentId:  payRef.id,
          instalment: '1st',
          amount:     advanceAmount,
          date:       Timestamp.fromDate(new Date(2026, 6, 1 + (idx % 28))),
          method:     ['gpay', 'bankTransfer', 'cash', 'cheque'][idx % 4],
          recordedBy: uid,
          createdAt:  serverTimestamp(),
        })
      }

      // Project Doc
      const projectDocData = {
        projectId:       projectRef.id,
        clientId:        clientRef.id,
        eventDate,
        startTime,
        endTime,
        eventName,
        clientName,
        clientContact:   contact,
        eventType,
        customEventType,
        notes:           `Seeded project #${idx + 1}`,
        bookingType,
        eventDates,
        ...(recurringSchedule ? { recurringSchedule } : {}),
        packageType:     pkg.name,
        stage,
        status:          stage === 'delivered' ? 'completed' : 'upcoming',
        staffUids:       [],
        freelancerIds:   [],
        milestones:      advanceAmount > 0
          ? { depositPaid: Timestamp.fromDate(new Date(2026, 6, 1 + (idx % 28))) }
          : {},
        createdBy:       uid,
        createdAt:       Timestamp.fromDate(new Date(2026, 6, 1 + (idx % 28))),
        updatedAt:       serverTimestamp(),
      }

      batch.set(projectRef, projectDocData)
    }

    await batch.commit()
    console.log(`  ✓ Committed batch ${Math.floor(i / CHUNK_SIZE) + 1}/${TOTAL_COUNT / CHUNK_SIZE} (10 records)`)
  }

  if (numSnap.exists()) {
    const numBatch = writeBatch(db)
    numBatch.update(doc(db, 'studioSettings', 'numberingConfig'), {
      invoiceStartNumber: nextNum + TOTAL_COUNT,
    })
    await numBatch.commit()
  }

  console.log(`\n🎉 SUCCESS: Seeded ${TOTAL_COUNT} extra high-quality client & project records into Firestore!`)
  process.exit(0)
}

seed100().catch(err => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})
