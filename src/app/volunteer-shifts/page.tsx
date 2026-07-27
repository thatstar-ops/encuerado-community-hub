import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

const EVENT_TIME_ZONE = 'America/Los_Angeles'
const ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES = ['Assigned', 'Confirmed', 'Interested']

function formatDate(date: Date | null) {
  if (!date) return '-'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDayHeading(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function shiftDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function errorMessage(code: string) {
  if (code === 'missing_required') return 'First name, last name, email, shirt size, and at least one shift are required.'
  if (code === 'invalid_shirt') return 'Please select a valid shirt size.'
  if (code === 'too_many_selected') return 'You may select a maximum of 3 volunteer shifts.'
  if (code === 'too_many_total') return 'This volunteer already has shift assignments. Public signup allows no more than 3 active shifts total.'
  if (code === 'no_available_shift') return 'None of the selected shifts are currently available. Please choose another open shift.'
  return ''
}

async function submitVolunteerShiftSignup(formData: FormData) {
  'use server'

  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const preferredName = String(formData.get('preferredName') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const phone = String(formData.get('phone') || '').trim()

  const allowedShirtSizes = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL']
  const shirtSize = String(formData.get('shirtSize') || '').trim().toUpperCase()
  const selectedShiftIds = dedupeStrings(formData.getAll('shiftIds').map(String))

  if (!firstName || !lastName || !email || selectedShiftIds.length === 0) {
    redirect('/volunteer-shifts?error=missing_required')
  }

  if (!allowedShirtSizes.includes(shirtSize)) {
    redirect('/volunteer-shifts?error=invalid_shirt')
  }

  if (selectedShiftIds.length > 3) {
    redirect('/volunteer-shifts?error=too_many_selected')
  }

  const member = await prisma.member.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      phone: phone || null,
      notes: 'Submitted volunteer shift signup.',
    },
    create: {
      firstName,
      lastName,
      preferredName: preferredName || null,
      email,
      phone: phone || null,
      country: 'USA',
      firstYearAttended: 2026,
      notes: 'Submitted volunteer shift signup.',
    },
  })

  const existingActiveAssignments = await prisma.volunteerAssignment.findMany({
    where: {
      memberId: member.id,
      status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
      shift: {
        archivedAt: null,
        cancelledAt: null,
      },
    },
    select: {
      shiftId: true,
    },
  })

  const existingActiveShiftIds = new Set(existingActiveAssignments.map((assignment) => assignment.shiftId))
  const newShiftIds = selectedShiftIds.filter((shiftId) => !existingActiveShiftIds.has(shiftId))

  if (existingActiveShiftIds.size + newShiftIds.length > 3) {
    redirect('/volunteer-shifts?error=too_many_total')
  }

  await prisma.volunteerProfile.upsert({
    where: { memberId: member.id },
    update: {
      status: 'Interested',
      consentToContact: true,
      shirtSize,
    },
    create: {
      memberId: member.id,
      status: 'Interested',
      consentToContact: true,
      shirtSize,
    },
  })

  let assignmentsCreatedOrUpdated = 0

  for (const shiftId of selectedShiftIds) {
    const shift = await prisma.volunteerShift.findFirst({
      where: {
        id: shiftId,
        status: 'Open',
        archivedAt: null,
        cancelledAt: null,
      },
      include: {
        assignments: {
          where: {
            status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
          },
          select: {
            memberId: true,
          },
        },
      },
    })

    if (!shift) continue

    const alreadyAssigned = shift.assignments.some(
      (assignment) => assignment.memberId === member.id
    )

    const assignedCount = shift.assignments.length
    const spotsLeft = Math.max(shift.neededCount - assignedCount, 0)

    if (spotsLeft <= 0 && !alreadyAssigned) continue

    await prisma.volunteerAssignment.upsert({
      where: {
        shiftId_memberId: {
          shiftId,
          memberId: member.id,
        },
      },
      update: {
        status: 'Assigned',
      },
      create: {
        shiftId,
        memberId: member.id,
        status: 'Assigned',
      },
    })

    assignmentsCreatedOrUpdated += 1
  }

  if (assignmentsCreatedOrUpdated === 0) {
    redirect('/volunteer-shifts?error=no_available_shift')
  }

  redirect('/volunteer-shifts/thank-you')
}

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default async function VolunteerShiftsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    shiftId?: string
    error?: string
  }>
}) {
  const params = searchParams ? await searchParams : {}
  const preselectedShiftId = params.shiftId || ''
  const error = errorMessage(params.error || '')

  const shifts = await prisma.volunteerShift.findMany({
    where: {
      status: 'Open',
      archivedAt: null,
      cancelledAt: null,
    },
    include: {
      event: true,
      assignments: {
        where: {
          status: { in: ACTIVE_VOLUNTEER_ASSIGNMENT_STATUSES },
        },
        select: {
          memberId: true,
        },
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
  })

  const availableShifts = shifts
    .map((shift) => {
      const assignedCount = shift.assignments.length
      const spotsLeft = Math.max(shift.neededCount - assignedCount, 0)

      return {
        ...shift,
        assignedCount,
        spotsLeft,
      }
    })
    .filter((shift) => shift.spotsLeft > 0 || shift.id === preselectedShiftId)

  const groupedShifts = availableShifts.reduce(
    (groups, shift) => {
      const key = shiftDateKey(shift.startsAt)
      if (!groups[key]) groups[key] = []
      groups[key].push(shift)
      return groups
    },
    {} as Record<string, typeof availableShifts>
  )

  const shiftDays = Object.entries(groupedShifts).sort(([a], [b]) => a.localeCompare(b))

  const preselectedShift = availableShifts.find(
    (shift) => shift.id === preselectedShiftId
  )

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]"
          >
            Back to dashboard
          </Link>

          {preselectedShiftId && (
            <Link
              href={`/shifts/${preselectedShiftId}/edit`}
              className="rounded-lg border border-[#B11218] px-5 py-3 text-base font-bold text-[#B11218] hover:bg-[#B11218] hover:text-white"
            >
              Back to Shift
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-8 shadow-2xl">
          <h1 className="text-4xl font-black uppercase tracking-wide text-white">
            Volunteer Shift Signup
          </h1>

          <p className="mt-3 text-lg text-[#B7B7B7]">
            Choose up to 3 volunteer shifts for Encuerado Weekend 2026. Your volunteer rewards update as you select shifts.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-[#B11218] bg-red-950 p-5 text-red-100">
              <div className="font-bold">Please review your signup</div>
              <div className="mt-1">{error}</div>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-bold text-[#B11218]">1 shift</div>
              <div className="mt-2 text-sm text-[#B7B7B7]">
                Free admission to the event you helped make possible, plus commemorative pin.
              </div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-bold text-[#B11218]">2 shifts</div>
              <div className="mt-2 text-sm text-[#B7B7B7]">
                T-shirt, commemorative pin, and free admission to the events you volunteered for.
              </div>
            </div>
            <div className="rounded-xl border border-[#2A0E10] bg-[#151111] p-5">
              <div className="text-sm font-bold text-[#B11218]">3 shifts</div>
              <div className="mt-2 text-sm text-[#B7B7B7]">
                Complete Encuerado Weekend 2026 Volunteer Package.
              </div>
            </div>
          </div>

          {preselectedShift && (
            <div className="mt-6 rounded-xl border border-[#B11218] bg-[#151111] p-5">
              <div className="text-sm font-bold text-[#B11218]">
                Pre-selected shift
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                {preselectedShift.title}
              </div>
              <div className="mt-1 text-[#B7B7B7]">
                {preselectedShift.event.title} - {formatDate(preselectedShift.startsAt)}
                {preselectedShift.endsAt && ` - ${formatDate(preselectedShift.endsAt)}`}
              </div>
            </div>
          )}

          {availableShifts.length === 0 ? (
            <div className="mt-8 rounded-xl border border-[#2A0E10] bg-[#151111] p-6">
              <h2 className="text-2xl font-bold text-white">
                No available shifts right now
              </h2>
              <p className="mt-2 text-[#B7B7B7]">
                Please check back later or contact the Encuerado team.
              </p>
            </div>
          ) : (
            <form action={submitVolunteerShiftSignup} className="mt-8 grid gap-8" id="volunteer-shift-form">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">
                    First name *
                  </span>
                  <input name="firstName" required className={inputClass} />
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">
                    Last name *
                  </span>
                  <input name="lastName" required className={inputClass} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">
                  Preferred name
                </span>
                <input name="preferredName" className={inputClass} />
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Email *</span>
                  <input name="email" type="email" required className={inputClass} />
                </label>

                <label className="grid gap-2">
                  <span className="text-base font-bold text-white">Phone</span>
                  <input name="phone" className={inputClass} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-base font-bold text-white">Shirt Size *</span>
                <select name="shirtSize" required className={inputClass}>
                  <option value="">Select a size</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                  <option value="XXXL">XXXL</option>
                </select>
              </label>

              <div>
                <h2 className="text-2xl font-bold text-white">Choose Shifts</h2>
                <p className="mt-2 text-sm text-[#8F8F8F]">
                  Public signup allows up to 3 active shifts total. Admin can adjust assignments later if needed.
                </p>

                <div id="reward-preview" className="mt-5 rounded-xl border border-[#B11218] bg-[#151111] p-5">
                  <div className="text-sm font-bold uppercase tracking-wide text-[#B11218]">
                    Your volunteer reward
                  </div>
                  <div id="reward-label" className="mt-2 text-2xl font-bold text-white">
                    Select shifts to preview your reward
                  </div>
                  <ul id="reward-items" className="mt-3 grid gap-1 text-[#B7B7B7]"></ul>
                  <div id="reward-warning" className="mt-3 hidden rounded-lg border border-[#B11218] bg-red-950 p-3 text-sm font-bold text-red-100">
                    You can select no more than 3 shifts.
                  </div>
                </div>

                <div className="mt-6 grid gap-6">
                  {shiftDays.map(([dateKey, dayShifts]) => (
                    <section key={dateKey} className="grid gap-4">
                      <h3 className="text-xl font-black uppercase tracking-wide text-[#B11218]">
                        {formatDayHeading(dayShifts[0].startsAt)}
                      </h3>

                      <div className="grid gap-4">
                        {dayShifts.map((shift) => (
                          <label
                            key={shift.id}
                            className="block cursor-pointer rounded-xl border border-[#2A0E10] bg-[#151111] p-5 hover:border-[#B11218]"
                          >
                            <div className="flex items-start gap-4">
                              <input
                                name="shiftIds"
                                value={shift.id}
                                type="checkbox"
                                defaultChecked={shift.id === preselectedShiftId}
                                className="shift-checkbox mt-2 h-5 w-5"
                              />

                              <div className="flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h3 className="text-xl font-bold text-white">
                                      {shift.title}
                                    </h3>
                                    <p className="mt-1 text-sm text-[#D11A22]">
                                      {shift.event.title}
                                    </p>
                                    {shift.event.location && (
                                      <p className="mt-1 text-sm text-[#B7B7B7]">
                                        Location: {shift.event.location}
                                      </p>
                                    )}
                                  </div>

                                  <span className="rounded-full bg-[#B11218] px-3 py-1 text-sm font-bold text-white">
                                    {shift.spotsLeft} spots left
                                  </span>
                                </div>

                                <div className="mt-3 grid gap-2 text-[#B7B7B7] md:grid-cols-2">
                                  <div>
                                    <span className="font-bold text-white">Start:</span>{' '}
                                    {formatDate(shift.startsAt)}
                                  </div>
                                  {shift.endsAt && (
                                    <div>
                                      <span className="font-bold text-white">End:</span>{' '}
                                      {formatDate(shift.endsAt)}
                                    </div>
                                  )}
                                </div>

                                {shift.description && (
                                  <p className="mt-3 text-[#B7B7B7]">
                                    {shift.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              <p className="text-sm text-[#8F8F8F]">
                By submitting, you agree to our{' '}
                <Link href="/privacy" className="font-bold text-[#B11218] hover:text-[#D11A22]">
                  Privacy Policy
                </Link>
                .
              </p>

              <button
                type="submit"
                className="rounded-lg bg-[#B11218] px-5 py-3 text-base font-bold text-white hover:bg-[#D11A22]"
              >
                Submit Volunteer Signup
              </button>

              <script
                dangerouslySetInnerHTML={{
                  __html: `
                    const checkboxes = Array.from(document.querySelectorAll('.shift-checkbox'));
                    const rewardLabel = document.getElementById('reward-label');
                    const rewardItems = document.getElementById('reward-items');
                    const rewardWarning = document.getElementById('reward-warning');
                    const form = document.getElementById('volunteer-shift-form');

                    const rewards = {
                      0: {
                        label: 'Select shifts to preview your reward',
                        items: []
                      },
                      1: {
                        label: '1-shift volunteer reward',
                        items: [
                          'Free admission to the event you helped make possible',
                          'Exclusive Encuerado Weekend 2026 commemorative pin'
                        ]
                      },
                      2: {
                        label: '2-shift volunteer reward',
                        items: [
                          'Official Encuerado Weekend 2026 commemorative T-shirt',
                          'Commemorative pin',
                          'Free admission to the events you volunteered for'
                        ]
                      },
                      3: {
                        label: '3-shift complete volunteer package',
                        items: [
                          'Complete Encuerado Weekend 2026 Volunteer Package',
                          'Official commemorative T-shirt',
                          'Commemorative pin',
                          'Free admission to all the events you helped make possible'
                        ]
                      }
                    };

                    function selectedCount() {
                      return checkboxes.filter((box) => box.checked).length;
                    }

                    function renderReward() {
                      const count = Math.min(selectedCount(), 3);
                      const reward = rewards[count] || rewards[0];

                      rewardLabel.textContent = reward.label;
                      rewardItems.innerHTML = reward.items.map((item) => '<li>• ' + item + '</li>').join('');

                      if (selectedCount() > 3) {
                        rewardWarning.classList.remove('hidden');
                      } else {
                        rewardWarning.classList.add('hidden');
                      }
                    }

                    checkboxes.forEach((box) => {
                      box.addEventListener('change', () => {
                        if (box.checked && selectedCount() > 3) {
                          box.checked = false;
                          rewardWarning.classList.remove('hidden');
                        }
                        renderReward();
                      });
                    });

                    if (form) {
                      form.addEventListener('submit', (event) => {
                        if (selectedCount() > 3) {
                          event.preventDefault();
                          rewardWarning.classList.remove('hidden');
                          rewardWarning.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      });
                    }

                    renderReward();
                  `,
                }}
              />
            </form>
          )}
        </div>
      </div>
    </main>
  )
}