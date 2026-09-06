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

const NAMES = [
  { name: 'Karthik & Priya', clientName: 'Karthik Rajan', email: 'karthik.rajan@gmail.com', phone: '9840112233' },
  { name: 'Vishal & Divya', clientName: 'Vishal Sundaram', email: 'vishal.s@yahoo.com', phone: '9884023456' },
  { name: 'Siddharth & Ananya', clientName: 'Siddharth Iyer', email: 'sid.ananya@gmail.com', phone: '9790934567' },
  { name: 'Arun & Sneha', clientName: 'Arun Kumar', email: 'arun.sneha@outlook.com', phone: '9841045678' },
  { name: 'Vignesh & Swetha', clientName: 'Vigneshwaran M', email: 'vicky.swetha@gmail.com', phone: '9940156789' },
  { name: 'Sanjay & Revathi', clientName: 'Sanjay Krishnan', email: 'sanjay.k@gmail.com', phone: '9840267890' },
  { name: 'Rohit & Pooja', clientName: 'Rohit Verma', email: 'rohit.pooja@gmail.com', phone: '9884178901' },
  { name: 'Manoj & Deepa', clientName: 'Manoj Balaji', email: 'manoj.deepa@yahoo.com', phone: '9790289012' },
  { name: 'Gautam & Nithya', clientName: 'Gautam Ramachandran', email: 'gautam.r@gmail.com', phone: '9841390123' },
  { name: 'Hari & Lakshmi', clientName: 'Hariharan S', email: 'hari.lakshmi@gmail.com', phone: '9940401234' },
  { name: 'Aarav Birthday Bash', clientName: 'Kavitha Ramesh', email: 'kavitha.r@gmail.com', phone: '9840512345' },
  { name: 'Diya 1st Birthday', clientName: 'Rajesh Khanna', email: 'rajesh.k@yahoo.com', phone: '9884623456' },
  { name: 'Ananya Baby Shower', clientName: 'Suresh Babu', email: 'suresh.b@gmail.com', phone: '9790734567' },
  { name: 'Rithanya Half-Saree Ceremony', clientName: 'Murugan Thangavel', email: 'murugan.t@gmail.com', phone: '9841845678' },
  { name: 'Shruti Puberty Function', clientName: 'Senthil Nathan', email: 'senthil.n@outlook.com', phone: '9940956789' },
  { name: 'TCS Annual Leadership Summit', clientName: 'Vikram Menon', email: 'corporate.events@tcs.com', phone: '9840067890' },
  { name: 'Zoho Creator Tech Conclave', clientName: 'Praveen Chandran', email: 'events@zoho.com', phone: '9884178902' },
  { name: 'Freshworks SaaS Meetup', clientName: 'Naveen Kumar', email: 'community@freshworks.com', phone: '9790289013' },
  { name: 'Greenwood International Sports Day', clientName: 'Sister Mary Teresa', email: 'sports@greenwood.edu', phone: '9841390124' },
  { name: 'DAV Matriculation Graduation Day', clientName: 'Principal Sharma', email: 'admin@davchennai.org', phone: '9940401235' },
  { name: 'Meena Professional Portfolio', clientName: 'Meena Krishnan', email: 'meena.k@gmail.com', phone: '9840512346' },
  { name: 'Dr. Arvind Medical Clinic Branding', clientName: 'Dr. Arvind Swaminathan', email: 'dr.arvind@apollo.com', phone: '9884623457' },
  { name: 'Nalli Silks Festive Shoot', clientName: 'Kishore Nalli', email: 'marketing@nallisilks.com', phone: '9790734568' },
  { name: 'GRT Jewellers Diamond Collection', clientName: 'Radhika Anand', email: 'campaigns@grtjewels.com', phone: '9841845679' },
  { name: 'Sharma Housewarming Ceremony', clientName: 'Ramesh Sharma', email: 'ramesh.sharma@gmail.com', phone: '9940956780' },
  { name: 'Iyer Grahapravesam', clientName: 'Venkatesh Iyer', email: 'venkat.iyer@gmail.com', phone: '9840067891' },
  { name: 'Kavya Naming Ceremony', clientName: 'Dinesh Karthik', email: 'dinesh.k@gmail.com', phone: '9884178903' },
  { name: 'Ashwin Upanayanam (Thread Ceremony)', clientName: 'Narayanan Sastry', email: 'narayanan.s@gmail.com', phone: '9790289014' },
  { name: 'Ritu Varma Fashion Shoot', clientName: 'Ritu Varma', email: 'ritu.model@gmail.com', phone: '9841390125' },
  { name: 'Organic Spices Product Catalog', clientName: 'Subramanian V', email: 'contact@southspices.in', phone: '9940401236' },
  { name: 'Vijay & Keerthi', clientName: 'Vijay Joseph', email: 'vijay.keerthi@gmail.com', phone: '9840512347' },
  { name: 'Ajith & Shalini Golden Jubilee', clientName: 'Ajith Kumar', email: 'ajith.k@yahoo.com', phone: '9884623458' },
  { name: 'Surya & Jyothika Engagement', clientName: 'Surya Sivakumar', email: 'surya.j@gmail.com', phone: '9790734569' },
  { name: 'Madhavan & Sarita Pre-Wedding', clientName: 'R Madhavan', email: 'maddy.sarita@gmail.com', phone: '9841845680' },
  { name: 'Pranav 21st Milestone', clientName: 'Pranav Mohan', email: 'pranav.m@gmail.com', phone: '9940956781' },
  { name: 'Baby Tara New Born Session', clientName: 'Deepak & Sandhya', email: 'deepak.sandhya@gmail.com', phone: '9840067892' },
  { name: 'Kalyani Sangeetha Sabha Concert', clientName: 'Smt. Kalyani R', email: 'kalyani.sabha@gmail.com', phone: '9884178904' },
  { name: 'IIT Madras Shaastra Tech Fest', clientName: 'IIT Events Team', email: 'shaastra@iitm.ac.in', phone: '9790289015' },
  { name: 'Loyola College Culturals Fest', clientName: 'Loyola Students Union', email: 'culturals@loyolacollege.edu', phone: '9841390126' },
  { name: 'Ashok Leyland EV Bus Unveiling', clientName: 'Raghavan Pillai', email: 'media@ashokleyland.com', phone: '9940401237' },
  { name: 'Nivin & Nazriya Destination Wedding', clientName: 'Nivin Pauly', email: 'nivin.naz@gmail.com', phone: '9840512348' },
  { name: 'Dhanush & Aishwarya Silver Jubilee', clientName: 'Dhanush K', email: 'dhanush.a@gmail.com', phone: '9884623459' },
  { name: 'Kiran Fitness Brand Ambassador Shoot', clientName: 'Kiran Dembla', email: 'kiran.fit@gmail.com', phone: '9790734570' },
  { name: 'Annam Gourmet Restaurant Launch', clientName: 'Chef Damodaran', email: 'chef.damu@annameats.in', phone: '9841845681' },
  { name: 'Kodaikanal Heritage Resort Promo', clientName: 'Manager John Doe', email: 'marketing@kodairesorts.com', phone: '9940956782' },
  { name: 'St. Patrick High School Monthly Coverage', clientName: 'Father George', email: 'admin@stpatricks.edu', phone: '9840067893' },
  { name: 'FitPro Gym Monthly Content Shoot', clientName: 'Coach Vikram', email: 'vikram@fitprogym.in', phone: '9884178905' },
  { name: 'Apex Corporate Monthly Board Meetings', clientName: 'Sekhar Roy', email: 'board@apexholdings.in', phone: '9790289016' },
  { name: 'Little Explorers Preschool Term Sessions', clientName: 'Anitha Reddy', email: 'contact@littleexplorers.edu', phone: '9841390127' },
  { name: 'Namma Chennai Marathon 2026', clientName: 'Tamil Nadu Sports Council', email: 'info@chennaimarathon.com', phone: '9940401238' },
]

const VENUES = [
  'Mayor Ramanathan Chettiar Hall, RA Puram',
  'ITC Grand Chola, Guindy',
  'Leela Palace, MRC Nagar',
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
]

const STAGES = ['booked', 'planning', 'preProduction', 'eventDay', 'postProduction', 'delivered']

async function seed50() {
  console.log('🌱 Starting Seeding of 50 Diverse Records...')
  const cred = await signInWithEmailAndPassword(auth, 'admin@studiozoom.in', 'StudioZoom@2026')
  const uid = cred.user.uid
  console.log('✅ Authenticated as Admin:', uid)

  // Get invoice numbering start
  let nextNum = 100
  const numSnap = await getDoc(doc(db, 'studioSettings', 'numberingConfig'))
  if (numSnap.exists()) {
    nextNum = numSnap.data().invoiceStartNumber ?? 100
  }

  // Create in chunks of 10 to respect Firestore batch limits (500 max writes)
  const CHUNK_SIZE = 10
  for (let i = 0; i < NAMES.length; i += CHUNK_SIZE) {
    const chunk = NAMES.slice(i, i + CHUNK_SIZE)
    const batch = writeBatch(db)

    for (let j = 0; j < chunk.length; j++) {
      const idx = i + j
      const item = chunk[j]
      const clientRef = doc(collection(db, 'clients'))
      const projectRef = doc(collection(db, 'projects'))

      const invoiceNo = `ZS-INV-2026-${String(nextNum + idx).padStart(3, '0')}`

      // Determine booking type
      let bookingType = 'oneTime'
      if (idx % 4 === 1) bookingType = 'multiDate'
      else if (idx % 7 === 0 && idx > 0) bookingType = 'recurring'

      // Determine eventType
      let eventType = 'wedding'
      let customEventType = ''
      if (item.name.includes('Birthday')) eventType = 'birthday'
      else if (item.name.includes('Shower')) eventType = 'babyShower'
      else if (item.name.includes('Puberty') || item.name.includes('Half-Saree')) eventType = 'puberty'
      else if (item.name.includes('Tech') || item.name.includes('Summit') || item.name.includes('Corporate') || item.name.includes('Unveiling')) eventType = 'corporate'
      else if (item.name.includes('School') || item.name.includes('Graduation') || item.name.includes('Sports') || item.name.includes('Fest')) eventType = 'schoolEvent'
      else if (item.name.includes('Portfolio') || item.name.includes('Clinic')) eventType = 'portrait'
      else if (item.name.includes('Shoot') || item.name.includes('Collection') || item.name.includes('Studio')) eventType = 'studio'
      else if (item.name.includes('Housewarming') || item.name.includes('Grahapravesam') || item.name.includes('Naming') || item.name.includes('Upanayanam') || item.name.includes('Marathon') || item.name.includes('Launch')) {
        eventType = 'other'
        customEventType = item.name.split(' ').slice(1).join(' ') || 'Special Ceremony'
      } else if (item.name.includes('Engagement')) eventType = 'engagement'
      else if (item.name.includes('Pre-Wedding')) eventType = 'preWedding'

      // Generate Dates: distributed from May 2026 to Dec 2027
      const monthOffset = (idx % 18) - 4
      const d = new Date(2026, 8 + monthOffset, (idx % 25) + 1, 9, 0, 0)
      const eventDate = Timestamp.fromDate(d)

      // Start & End Timings
      const startTimes = ['06:00', '08:30', '09:00', '10:00', '16:00', '18:00', '18:30']
      const endTimes = ['12:00', '14:00', '17:00', '21:00', '22:30', '23:00']
      const startTime = startTimes[idx % startTimes.length]
      const endTime = endTimes[idx % endTimes.length]

      const venue = VENUES[idx % VENUES.length]
      const pkg = PACKAGES[idx % PACKAGES.length]
      const totalAmount = pkg.price

      // Multi-date sub-dates
      let eventDates = []
      if (bookingType === 'multiDate') {
        const numDays = (idx % 3) + 2 // 2, 3, or 4 days
        const labels = ['Mehendi', 'Sangeet', 'Muhurtham', 'Reception', 'Haldi', 'Maruveedu']
        for (let day = 0; day < numDays; day++) {
          const subD = new Date(d.getTime() + day * 86400000)
          eventDates.push({
            id: `sub_${idx}_${day}`,
            label: labels[(idx + day) % labels.length],
            date: Timestamp.fromDate(subD),
            startTime: startTimes[(idx + day) % startTimes.length],
            endTime: endTimes[(idx + day) % endTimes.length],
            location: VENUES[(idx + day) % VENUES.length],
          })
        }
      }

      // Recurring schedule
      let recurringSchedule = null
      if (bookingType === 'recurring') {
        const totalSessions = ((idx % 4) + 1) * 3 // 3, 6, 9, 12 sessions
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
        // Full paid
        advanceAmount = totalAmount
        paymentStatus = 'paid'
      } else if (idx % 10 < 8) {
        // Partial
        advanceAmount = Math.round(totalAmount * ((idx % 3 + 2) / 10)) // 20% to 40%
        paymentStatus = 'partial'
      } else {
        // Unpaid
        advanceAmount = 0
        paymentStatus = 'unpaid'
      }
      const balanceDue = Math.max(0, totalAmount - advanceAmount)

      // Stage
      let stage = STAGES[idx % STAGES.length]
      if (d < new Date() && paymentStatus === 'paid') stage = 'delivered'

      // Client doc
      const clientDocData = {
        clientId:        clientRef.id,
        projectId:       projectRef.id,
        name:            item.clientName,
        contact:         `+91${item.phone}`,
        email:           item.email,
        eventName:       item.name,
        eventType,
        customEventType,
        eventDate,
        startTime,
        endTime,
        location:        venue,
        notes:           `Seeded booking record #${idx + 1}. Special requirements recorded.`,
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
        createdAt:       Timestamp.fromDate(new Date(2026, 7, 1 + (idx % 25))),
        updatedAt:       serverTimestamp(),
      }

      batch.set(clientRef, clientDocData)

      // Payment record if advance > 0
      if (advanceAmount > 0) {
        const payRef = doc(collection(db, 'clients', clientRef.id, 'payments'))
        batch.set(payRef, {
          paymentId:  payRef.id,
          instalment: '1st',
          amount:     advanceAmount,
          date:       Timestamp.fromDate(new Date(2026, 7, 1 + (idx % 25))),
          method:     ['gpay', 'bankTransfer', 'cash', 'cheque'][idx % 4],
          recordedBy: uid,
          createdAt:  serverTimestamp(),
        })
      }

      // Project doc
      const projectDocData = {
        projectId:       projectRef.id,
        clientId:        clientRef.id,
        eventDate,
        startTime,
        endTime,
        eventName:       item.name,
        clientName:      item.clientName,
        clientContact:   `+91${item.phone}`,
        eventType,
        customEventType,
        notes:           `Seeded project record #${idx + 1}`,
        bookingType,
        eventDates,
        ...(recurringSchedule ? { recurringSchedule } : {}),
        packageType:     pkg.name,
        stage,
        status:          stage === 'delivered' ? 'completed' : 'upcoming',
        staffUids:       [],
        freelancerIds:   [],
        milestones:      advanceAmount > 0
          ? { depositPaid: Timestamp.fromDate(new Date(2026, 7, 1 + (idx % 25))) }
          : {},
        createdBy:       uid,
        createdAt:       Timestamp.fromDate(new Date(2026, 7, 1 + (idx % 25))),
        updatedAt:       serverTimestamp(),
      }

      batch.set(projectRef, projectDocData)
    }

    await batch.commit()
    console.log(`  ✓ Committed batch ${i / CHUNK_SIZE + 1} (${chunk.length} records)`)
  }

  // Update invoice counter
  if (numSnap.exists()) {
    const numBatch = writeBatch(db)
    numBatch.update(doc(db, 'studioSettings', 'numberingConfig'), {
      invoiceStartNumber: nextNum + NAMES.length,
    })
    await numBatch.commit()
  }

  console.log(`\n🎉 SUCCESS: Seeded ${NAMES.length} diverse, high-quality client & project records into Firestore!`)
  process.exit(0)
}

seed50().catch(err => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})
