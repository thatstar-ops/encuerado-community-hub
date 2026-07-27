import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient()

// Seed admin credentials come from env vars so nothing sensitive is
// hardcoded in source. If SEED_ADMIN_PASSWORD isn't set, a random one is
// generated and printed once - it is never written back to this file.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@encuerado.org'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url')
const ADMIN_PASSWORD_WAS_GENERATED = !process.env.SEED_ADMIN_PASSWORD

async function main() {
  console.log('Seeding Encuerado Community Hub...')

  await prisma.eventRegistration.deleteMany()
  await prisma.event.deleteMany()
  await prisma.member.deleteMany()
  await prisma.adminUser.deleteMany()

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)

  await prisma.adminUser.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: 'Admin User',
    },
  })

  const carlos = await prisma.member.create({
    data: {
      firstName: 'Carlos',
      lastName: 'Rivera',
      preferredName: 'Carlos',
      email: 'carlos.rivera@example.com',
      phone: '512-555-0101',
      city: 'Austin',
      state: 'TX',
      country: 'USA',
      firstYearAttended: 2025,
      notes: 'Sample attendee and volunteer',
    },
  })

  const miguel = await prisma.member.create({
    data: {
      firstName: 'Miguel',
      lastName: 'Sanchez',
      preferredName: 'Miguel',
      email: 'miguel.sanchez@example.com',
      phone: '512-555-0102',
      city: 'San Antonio',
      state: 'TX',
      country: 'USA',
      firstYearAttended: 2025,
      notes: 'Sample attendee',
    },
  })

  const elena = await prisma.member.create({
    data: {
      firstName: 'Elena',
      lastName: 'Vasquez',
      preferredName: 'Elena',
      email: 'elena.vasquez@example.com',
      phone: '512-555-0103',
      city: 'Houston',
      state: 'TX',
      country: 'USA',
      firstYearAttended: 2025,
      notes: 'Sample volunteer',
    },
  })

  const welcomeSocial = await prisma.event.create({
    data: {
      title: 'Encuerado Welcome Social',
      description: 'Opening social for attendees, volunteers, and community members.',
      location: 'Austin, TX',
      startsAt: new Date('2026-09-18T19:00:00'),
      endsAt: new Date('2026-09-18T22:00:00'),
      capacity: 150,
      status: 'Published',
    },
  })

  const volunteerOrientation = await prisma.event.create({
    data: {
      title: 'Volunteer Orientation',
      description: 'Orientation session for event volunteers and shift leads.',
      location: 'Austin, TX',
      startsAt: new Date('2026-09-19T10:00:00'),
      endsAt: new Date('2026-09-19T11:30:00'),
      capacity: 40,
      status: 'Published',
    },
  })

  const communityBrunch = await prisma.event.create({
    data: {
      title: 'Community Brunch',
      description: 'Casual brunch and closing community gathering.',
      location: 'Austin, TX',
      startsAt: new Date('2026-09-20T11:00:00'),
      endsAt: new Date('2026-09-20T13:00:00'),
      capacity: 100,
      status: 'Draft',
    },
  })

  await prisma.eventRegistration.createMany({
    data: [
      {
        memberId: carlos.id,
        eventId: welcomeSocial.id,
        status: 'Attended',
        checkedIn: true,
        notes: 'Helped with welcome table.',
      },
      {
        memberId: miguel.id,
        eventId: welcomeSocial.id,
        status: 'Registered',
        checkedIn: false,
        notes: 'Registered for welcome social.',
      },
      {
        memberId: elena.id,
        eventId: volunteerOrientation.id,
        status: 'Attended',
        checkedIn: true,
        notes: 'Completed volunteer orientation.',
      },
      {
        memberId: carlos.id,
        eventId: communityBrunch.id,
        status: 'Registered',
        checkedIn: false,
        notes: 'Interested in attending brunch.',
      },
    ],
  })

  console.log('Seed complete.')
  console.log(
    `Admin login: ${ADMIN_EMAIL} / ${
      ADMIN_PASSWORD_WAS_GENERATED
        ? `${ADMIN_PASSWORD} (randomly generated for this run - change it after first login)`
        : '(password set via SEED_ADMIN_PASSWORD)'
    }`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
