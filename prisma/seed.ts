// ============================================================
// Seed — مکتب خصوصی نداالقلم (Neda al-Qalam Private School)
// Idempotent: skips if any User already exists.
// Run: bun prisma/seed.ts
// ============================================================
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const db = new PrismaClient();

// ---------- deterministic pseudo-random ----------
function makeRand(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const rnd = makeRand(1405);
const rint = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  const existing = await db.user.count();
  if (existing > 0) {
    console.log("⏭  Seed skipped — users already exist (idempotent).");
    return;
  }
  console.log("🌱 Seeding مکتب خصوصی نداالقلم ...");

  // ================= Users =================
  const admin = await db.user.create({ data: { username: "admin", passwordHash: hashPassword("admin123"), fullName: "مدیر سیستم", role: "ADMIN", phone: "0791680632" } });
  const owner = await db.user.create({ data: { username: "owner", passwordHash: hashPassword("owner123"), fullName: "صاحب مکتب", role: "OWNER", phone: "0791680632" } });
  const finance = await db.user.create({ data: { username: "finance", passwordHash: hashPassword("finance123"), fullName: "مدیر مالی", role: "FINANCE", phone: "0780112233" } });
  const teacher = await db.user.create({ data: { username: "teacher", passwordHash: hashPassword("teacher123"), fullName: "معلم صنف ششم", role: "TEACHER", phone: "0799445566" } });

  // ================= School / Branch / Years =================
  const year1405 = await db.academicYear.create({
    data: { name: "1405", startDate: D("2026-03-26"), endDate: D("2027-03-20"), isCurrent: true },
  });
  await db.academicYear.create({
    data: { name: "1406", startDate: D("2027-03-21"), endDate: D("2028-03-20"), isCurrent: false },
  });

  const school = await db.school.create({
    data: {
      name: "مکتب خصوصی نداالقلم",
      nameEn: "Neda al-Qalam Private School",
      licenseNo: "ل-۱۴۰۲-۳۴۵",
      phone: "0791680632",
      email: "hasamsayedi0987@gmail.com",
      address: "کابل، افغانستان",
      currentYearId: year1405.id,
    },
  });
  await db.branch.create({ data: { schoolId: school.id, name: "شعبه مرکزی", address: "کابل، افغانستان" } });

  // ================= Settings =================
  const settings: Record<string, string> = {
    passMark: "40",
    minAverage: "55",
    gradeBands: JSON.stringify([
      { min: 86, label: "عالی" },
      { min: 66, label: "خوب" },
      { min: 40, label: "قابل" },
      { min: 0, label: "مردود" },
    ]),
    examWeights: JSON.stringify([
      { type: "چهارونیم‌ماهه", maxPerSubject: 40 },
      { type: "سالانه", maxPerSubject: 60 },
      { type: "دو ماهه اول", maxPerSubject: 100 },
      { type: "دو ماهه دوم", maxPerSubject: 100 },
    ]),
    smsGatewayUrl: "",
    smsApiKey: "",
    smsSender: "",
    defaultLocale: "dr",
    schoolName: "مکتب خصوصی نداالقلم",
    schoolNameEn: "Neda al-Qalam Private School",
    licenseNo: "ل-۱۴۰۲-۳۴۵",
    schoolPhone: "0791680632",
    schoolEmail: "hasamsayedi0987@gmail.com",
    schoolAddress: "کابل، افغانستان",
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.create({ data: { key, value } });
  }

  // ================= Subjects =================
  const subjectData: [string, string, string][] = [
    ["قرآن کریم", "قرآن کریم", "Holy Quran"],
    ["تعلیمات اسلامی", "تعلیمات اسلامی", "Islamic Education"],
    ["دری", "دری", "Dari"],
    ["پشتو", "پښتو", "Pashto"],
    ["ریاضی", "ریاضي", "Mathematics"],
    ["علوم", "علوم", "Science"],
    ["مطالعات اجتماعی", "ټولنیزې زده کړې", "Social Studies"],
    ["زبان انگلیسی", "انګلیسي", "English"],
    ["جغرافیه", "جغرافیه", "Geography"],
    ["تاریخ", "تاریخ", "History"],
    ["فزیک", "فزیک", "Physics"],
    ["کیمیا", "کیمیا", "Chemistry"],
    ["زیات", "زیات", "Biology"],
    ["معلومات و تکنالوژی", "معلومات او ټیکنالوژي", "ICT"],
  ];
  const subjects = [] as { id: string; nameDr: string }[];
  for (const [nameDr, namePs, nameEn] of subjectData) {
    subjects.push(await db.subject.create({ data: { nameDr, namePs, nameEn } }));
  }

  // ================= Classrooms =================
  const gradeNames = ["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم", "نهم", "دهم", "یازدهم", "دوازدهم"];
  const levelOf = (g: number) => (g <= 6 ? "ابتدائیه" : g <= 9 ? "متوسطه" : "لیسه");
  const classrooms: Record<string, { id: string; grade: number; section: string }> = {};
  const addClassroom = async (grade: number, section: string) => {
    const key = `${grade}${section}`;
    classrooms[key] = {
      id: (
        await db.classroom.create({
          data: {
            academicYearId: year1405.id,
            grade,
            section,
            name: `صنف ${gradeNames[grade - 1]} - شعبه ${section}`,
            level: levelOf(grade),
          },
        })
      ).id,
      grade,
      section,
    };
  };
  for (let g = 1; g <= 12; g++) await addClassroom(g, "الف");
  await addClassroom(6, "ب");
  await addClassroom(9, "ب");

  // ================= Staff =================
  const staffData: [string, string, string, string, string, number][] = [
    // [name, fatherName, position, specialty, degree, salary]
    ["عبدالبصیر", "عبدالقیوم", "معلم", "ریاضی", "لیانس", 12000],
    ["سلطان محمود", "غلام رسول", "معلم", "دری", "لیانس", 11000],
    ["احمد جاوید", "محمد نعیم", "معلم", "زبان انگلیسی", "لیانس", 11000],
    ["محترم فرشته", "عبدالواحد", "معلم", "علوم", "لیانس", 10000],
    ["عبدالهادی", "حبیب الله", "اداری", "مدیر آموزشی", "ماستری", 18000],
    ["نصیر احمد", "عبدالستار", "اداری", "حسابداری", "لیانس", 15000],
    ["سمیع الله", "محمدگل", "اداری", "کتابتخانه", "دیپلم", 9000],
    ["محمودشاه", "عبدالجواد", "اداری", "سرپرست ترانسپورت", "دیپلم", 10000],
    ["شیرین خان", "میرزا خان", "اداری", "امور اداری", "دیپلم", 8500],
    ["گل آغا", "بابا جان", "خدمات", "", "ابتدائیه", 8000],
  ];
  const staff: { id: string; name: string; position: string; baseSalary: number }[] = [];
  for (let i = 0; i < staffData.length; i++) {
    const [name, fatherName, position, specialty, degree, salary] = staffData[i];
    staff.push(
      await db.staff.create({
        data: {
          staffNo: `ST-${String(i + 1).padStart(3, "0")}`,
          name,
          fatherName,
          position,
          subjectSpecialty: specialty || null,
          educationDegree: degree,
          tazkiraNo: `12${(300000 + i * 8237).toString()}`,
          phone: `07${String(10000000 + i * 1441).slice(-8)}`,
          hireDate: D(i % 2 === 0 ? "2024-03-01" : "2025-03-02"),
          baseSalary: salary,
          status: "active",
        },
      }),
    );
  }
  const teachers = staff.filter((s) => s.position === "معلم");

  // ================= ClassSubjects =================
  const subjectsForGrade = (g: number): { id: string; nameDr: string }[] => {
    if (g <= 3) return subjects.slice(0, 6);
    if (g <= 6) return subjects.slice(0, 8);
    return subjects.slice(0, 14); // 7-12 same set
  };
  const classSubjectsByClassroom: Record<string, { id: string; subjectId: string }[]> = {};
  let teacherCursor = 0;
  for (const key of Object.keys(classrooms)) {
    const cls = classrooms[key];
    const list: { id: string; subjectId: string }[] = [];
    for (const subj of subjectsForGrade(cls.grade)) {
      const t = teachers[teacherCursor % teachers.length];
      teacherCursor++;
      list.push(
        await db.classSubject.create({
          data: { classroomId: cls.id, subjectId: subj.id, staffId: t.id },
        }),
      );
    }
    classSubjectsByClassroom[key] = list;
  }
  // homeroom teachers
  await db.classroom.update({ where: { id: classrooms["6الف"].id }, data: { homeroomStaffId: teachers[0].id } });
  await db.classroom.update({ where: { id: classrooms["9الف"].id }, data: { homeroomStaffId: teachers[3].id } });

  // ================= Fee Structures =================
  const bands: [string, number][] = [["1-3", 900], ["4-6", 1000], ["7-9", 1200], ["10-12", 1500]];
  const feeOfGrade = (g: number) => (g <= 3 ? 900 : g <= 6 ? 1000 : g <= 9 ? 1200 : 1500);
  for (const [gradeBand, monthlyAmount] of bands) {
    await db.feeStructure.create({ data: { academicYearId: year1405.id, gradeBand, monthlyAmount } });
  }

  // ================= Students (42) =================
  const maleNames = ["محمد نعیم", "احمد شاه", "عبدالبصیر", "سمیع الله", "حبیب الرحمن", "مصطفی", "عبدالواسع", "محمد آصف", "رحمت الله", "خالد", "فرهاد", "ظاهر گل", "عبدالرحمن", "جواد", "نصر الله", "یاسین", "حمید", "ادریس", "لطیف", "محمد یوسف", "زبرین", "طاهر", "شکور", "منیر"];
  const femaleNames = ["مریم", "زرغونه", "فرشته", "نگار", "وحیده", "معصومه", "حبیبه", "نرگس", "زهرا", "سکینه", "نزهت", "طلوع", "شکریه", "نادیا", "گلناز", "آسماء", "مادلین", "ثریا"];
  const fatherNames = ["عبدالغنی", "محمدظاهر", "غلام سخی", "محمدایوب", "عبدالغفار", "عبدالحمید", "محمدنبی", "غلام فاروق", "عبدالودود", "محمد اسحاق", "عبدالمنان", "نور محمد"];
  const grandFatherNames = ["محمدگل", "عبدالرحیم", "خداییار", "گل محمد", "محمد یوسف", "عبدالشکور"];
  const provinceDistricts: [string, string[]][] = [
    ["کابل", ["پغمان", "ده سبز", "قره‌باغ", "موسی هی", "کارته نو"]],
    ["بلخ", ["مزار شریف", "چمتل", "نهرشاهی"]],
    ["ننگرهار", ["جلوز", "بهسود", "سرخرود", "کامه"]],
    ["هرات", ["انجیل", "گذره", "کروخ"]],
    ["بامیان", ["یکاولنگ", "مرکز بامیان"]],
    ["غزنی", ["قره‌باغ غزنی", "اندر"]],
    ["قندهار", ["پنجوایی", "سپین بولدک"]],
    ["تخار", ["خواجه غار", "رستاق", "درقد"]],
  ];
  const tashList = ["تاجک", "پشتون", "ازبک", "هزاره", "قزلباش"];
  // grade → student count (sums to 42)
  const gradeCounts: [number, string, number][] = [
    [1, "الف", 4], [2, "الف", 4], [3, "الف", 4], [4, "الف", 4], [5, "الف", 4], [6, "الف", 5],
    [7, "الف", 4], [8, "الف", 4], [9, "الف", 3], [10, "الف", 3], [11, "الف", 2], [12, "الف", 1],
  ];

  type PendingAttendance = { enrollmentId: string; studentIdx: number };
  const attendancePending: PendingAttendance[] = [];
  type PendingPayment = { invoiceId: string; amount: number; date: string; monthKey: string };
  const paymentsPending: PendingPayment[] = [];

  let studentIdx = 0;
  for (const [grade, section, count] of gradeCounts) {
    const cls = classrooms[`${grade}${section}`];
    for (let k = 0; k < count; k++) {
      const i = studentIdx++;
      const isFemale = grade % 3 === 2 && i % 2 === 0 ? true : i % 5 < 2; // mixed, deterministic
      const firstName = isFemale ? pick(femaleNames, i * 3 + grade) : pick(maleNames, i * 3 + grade);
      const fatherName = pick(fatherNames, i);
      const grandFatherName = pick(grandFatherNames, i * 2);
      const [province, districts] = provinceDistricts[i % provinceDistricts.length];
      const district = pick(districts, i);
      const birthYear = 1405 - (grade + 6);
      const studentNo = `1405-${String(i + 1).padStart(4, "0")}`;
      const student = await db.student.create({
        data: {
          studentNo,
          firstName,
          fatherName,
          grandFatherName,
          tash: pick(tashList, i),
          gender: isFemale ? "اناث" : "ذکور",
          birthDateJalali: `${birthYear}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
          birthProvince: province,
          birthDistrict: district,
          province,
          district,
          village: "",
          address: `${district}، ${province}`,
          tazkiraNo: `13${(100000 + i * 379).toString()}`,
          guardianName: fatherName,
          guardianRelation: "پدر",
          guardianPhone: `07${String(10000000 + i * 733).slice(-8)}`,
          previousSchool: i % 4 === 0 ? "مکتب ابتدائیه دولتی" : "",
          notes: "",
          status: "active",
        },
      });
      const uniform = i % 3 === 0 ? JSON.stringify(["پیراهن", "تنبان", "سرپوش"]) : null;
      const enrollment = await db.enrollment.create({
        data: {
          studentId: student.id,
          classroomId: cls.id,
          academicYearId: year1405.id,
          rollNo: k + 1,
          enrolledAt: D("2026-03-28"),
          status: "active",
          uniformItems: uniform,
        },
      });
      attendancePending.push({ enrollmentId: enrollment.id, studentIdx: i });

      // ---- Fee invoices: میزان (1405-07) + عقرب (1405-08) ----
      const amount = feeOfGrade(grade);
      for (const [monthIdx, monthKey] of [["0", "1405-07"], ["1", "1405-08"]] as [string, string][]) {
        const bucket = (i * 3 + monthIdx * 7) % 20; // ~71% full, ~15% partial, ~14% unpaid
        let discount = 0;
        if ((i === 3 && monthIdx === "0") || (i === 9 && monthIdx === "1")) discount = 100;
        if (i === 17 && monthIdx === "0") discount = 200;
        const invoice = await db.feeInvoice.create({
          data: {
            enrollmentId: enrollment.id,
            classroomId: cls.id,
            academicYearId: year1405.id,
            monthKey,
            amount,
            discount,
            paidAmount: 0,
          },
        });
        if (bucket <= 13) {
          const day = 2 + ((i * 3 + monthIdx * 5) % 18);
          const date = monthKey === "1405-07" ? `2026-10-${String(day).padStart(2, "0")}` : `2026-11-${String(day).padStart(2, "0")}`;
          paymentsPending.push({ invoiceId: invoice.id, amount: amount - discount, date, monthKey });
        } else if (bucket <= 16) {
          const day = 4 + ((i * 3 + monthIdx * 5) % 14);
          const date = monthKey === "1405-07" ? `2026-10-${String(day).padStart(2, "0")}` : `2026-11-${String(day).padStart(2, "0")}`;
          paymentsPending.push({ invoiceId: invoice.id, amount: Math.round((amount - discount) * 0.6), date, monthKey });
        } else {
          // unpaid — keeps a fraction of guardians with باقی‌مانده for notifications
        }
        // track paid amount later after receipt assignment
      }
    }
  }

  // ================= Attendance (last 10 weekdays of 2026-11-01..15) =================
  const weekdays: string[] = [];
  for (let d = 1; d <= 15; d++) {
    const date = new Date(Date.UTC(2026, 10, d));
    if (date.getUTCDay() !== 5) weekdays.push(`2026-11-${String(d).padStart(2, "0")}`);
  }
  const last10 = weekdays.slice(-10);
  const studentStatuses = ["حاضر", "غایب", "مریض", "رخصتی"];
  for (const p of attendancePending) {
    for (let di = 0; di < last10.length; di++) {
      const roll = (p.studentIdx * 7 + di * 3) % 10;
      const status = roll < 9 ? "حاضر" : studentStatuses[1 + ((p.studentIdx + di) % 3)];
      await db.studentAttendance.create({
        data: { enrollmentId: p.enrollmentId, date: D(last10[di]), status, note: status !== "حاضر" && di === 3 ? "اطلاع ولی" : null },
      });
    }
  }
  for (let si = 0; si < staff.length; si++) {
    for (let di = 0; di < last10.length; di++) {
      const roll = (si * 5 + di * 2) % 10;
      const status = roll < 9 ? "حاضر" : ["غایب", "رخصتی", "ماموریت"][si % 3];
      await db.staffAttendance.create({
        data: { staffId: staff[si].id, date: D(last10[di]), status },
      });
    }
  }

  // ================= Fee payments (receipts RS-1405-0001…) + treasury دخل =================
  paymentsPending.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < paymentsPending.length; i++) {
    const p = paymentsPending[i];
    const receiptNo = `RS-1405-${String(i + 1).padStart(4, "0")}`;
    const payment = await db.feePayment.create({
      data: {
        invoiceId: p.invoiceId,
        amount: p.amount,
        date: D(p.date),
        method: i % 5 === 0 ? "بانکی" : "نقدی",
        receiptNo,
        createdByUserId: finance.id,
      },
    });
    await db.feeInvoice.update({
      where: { id: p.invoiceId },
      data: { paidAmount: { increment: p.amount } },
    });
    const invoice = await db.feeInvoice.findUnique({ where: { id: p.invoiceId } });
    await db.treasuryTransaction.create({
      data: {
        academicYearId: year1405.id,
        type: "دخل",
        source: "فیس",
        amount: p.amount,
        date: D(p.date),
        refModel: "FeePayment",
        refId: payment.id,
        description: `فیس ${p.monthKey} رسید ${receiptNo}`,
        createdByUserId: finance.id,
      },
    });
    void invoice;
  }

  // ================= Opening capital + Money handover (میزان) =================
  await db.treasuryTransaction.create({
    data: {
      academicYearId: year1405.id,
      type: "دخل",
      source: "دیگر",
      amount: 400000,
      date: D("2026-03-26"),
      refModel: "OpeningBalance",
      refId: "",
      description: "سرمایه اولیه مکتب در آغاز سال تعلیمی ۱۴۰۵",
      createdByUserId: owner.id,
    },
  });

  const mezanPayments = await db.feePayment.findMany({
    where: { invoice: { monthKey: "1405-07" } },
    select: { amount: true, id: true },
  });
  const mezanTotal = mezanPayments.reduce((s, p) => s + p.amount, 0);
  const handover = await db.moneyHandover.create({
    data: {
      academicYearId: year1405.id,
      periodFrom: "1405-07",
      periodTo: "1405-07",
      amount: mezanTotal,
      receiptNo: "HT-1405-0001",
      createdByUserId: finance.id,
      status: "تسلیم‌شده",
      confirmedAt: D("2026-10-20"),
      note: "تسلیمی عواید فیس ماه میزان به صاحب مکتب",
    },
  });
  await db.treasuryTransaction.create({
    data: {
      academicYearId: year1405.id,
      type: "تجری",
      source: "تسلیمی",
      amount: mezanTotal,
      date: D("2026-10-20"),
      refModel: "MoneyHandover",
      refId: handover.id,
      description: "تسلیمی عواید فیس ماه میزان رسید HT-1405-0001",
      createdByUserId: finance.id,
    },
  });
  await db.auditLog.create({
    data: { userId: finance.id, action: "money", entity: "MoneyHandover", entityId: handover.id, detail: JSON.stringify({ amount: mezanTotal, receiptNo: "HT-1405-0001" }) },
  });

  // ================= Transport =================
  const transportStudents = await db.student.findMany({
    where: { status: "active" },
    orderBy: { studentNo: "asc" },
    take: 10,
  });
  const transportEnrollments: { id: string; studentNo: string }[] = [];
  for (const st of transportStudents) {
    transportEnrollments.push(
      await db.transportEnrollment.create({
        data: { studentId: st.id, academicYearId: year1405.id, routeName: "مسیر کارته نو", monthlyFee: 800, active: true },
      }),
    );
  }
  for (let i = 0; i < 7; i++) {
    const tp = await db.transportPayment.create({
      data: {
        transportEnrollmentId: transportEnrollments[i].id,
        monthKey: "1405-08",
        amount: 800,
        date: D(`2026-10-${String(24 + (i % 8)).padStart(2, "0")}`),
        receiptNo: `TP-1405-${String(i + 1).padStart(4, "0")}`,
      },
    });
    await db.treasuryTransaction.create({
      data: {
        academicYearId: year1405.id,
        type: "دخل",
        source: "ترانسپورت",
        amount: 800,
        date: tp.date,
        refModel: "TransportPayment",
        refId: tp.id,
        description: `ترانسپورت عقرب رسید TP-1405-${String(i + 1).padStart(4, "0")}`,
        createdByUserId: finance.id,
      },
    });
  }
  const transportExpenses: [string, string, number, string][] = [
    ["2026-10-26", "سوخت", 3000, "برای مسیر کارته نو"],
    ["2026-10-30", "تعمیرات", 4500, "تبدیل لاستیک"],
    ["2026-11-02", "سوخت", 3000, "برای مسیر کارته نو"],
    ["2026-11-05", "معاش راننده", 12000, "راننده عبدالروف"],
    ["2026-11-09", "سوخت", 3000, "برای مسیر کارته نو"],
  ];
  for (const [date, category, amount, note] of transportExpenses) {
    const te = await db.transportExpense.create({ data: { date: D(date), category, amount, note } });
    await db.treasuryTransaction.create({
      data: {
        academicYearId: year1405.id,
        type: "تجری",
        source: "ترانسپورت",
        amount,
        date: D(date),
        refModel: "TransportExpense",
        refId: te.id,
        description: `${category} ترانسپورت`,
        createdByUserId: finance.id,
      },
    });
  }

  // ================= Store: items, purchases, sales =================
  const itemsData: [string, string, string, number, number][] = [
    // type, name, size, purchasePrice, salePrice
    ["کتاب", "کتاب ریاضی صنف ششم", "", 250, 350],
    ["کتاب", "کتاب دری صنف هفتم", "", 210, 300],
    ["کتاب", "کتاب انگلیسی صنف هشتم", "", 280, 400],
    ["کتاب", "کتاب علوم صنف نهم", "", 315, 450],
    ["کتاب", "قرآن کریم صنف دوم", "", 175, 250],
    ["کتاب", "تعلیمات اسلامی صنف دهم", "", 280, 400],
    ["یونیفورم", "ست پارچه یونیفورم (۳ پارچه)", "", 1600, 2200],
    ["یونیفورم", "پیراهن یونیفورم", "متوسط", 600, 900],
    ["یونیفورم", "تنبان یونیفورم", "متوسط", 450, 700],
    ["یونیفورم", "سرپوش", "فری", 280, 400],
  ];
  const items: { id: string; name: string; type: string; purchasePrice: number; salePrice: number }[] = [];
  for (const [type, name, size, purchasePrice, salePrice] of itemsData) {
    items.push(await db.item.create({ data: { type, name, size: size || null, purchasePrice, salePrice, stockQty: 0 } }));
  }
  const purchasesPlan: [number, number, string, string, string][] = [
    // itemIdx, qty, date, supplier, note
    [0, 50, "2026-09-10", "چاپخانه میوند", ""],
    [1, 40, "2026-09-10", "چاپخانه میوند", ""],
    [2, 40, "2026-09-14", "چاپخانه ارگ", ""],
    [3, 35, "2026-10-05", "چاپخانه ارگ", ""],
    [4, 45, "2026-09-16", "مطبعه نور", ""],
    [5, 30, "2026-10-05", "مطبعه نور", ""],
    [6, 30, "2026-09-20", "فابریک لباس افغانی", ""],
    [7, 40, "2026-10-02", "فابریک لباس افغانی", ""],
    [8, 40, "2026-10-02", "فابریک لباس افغانی", ""],
    [9, 35, "2026-10-06", "بازار کابل", ""],
  ];
  for (let i = 0; i < purchasesPlan.length; i++) {
    const [itemIdx, qty, date, supplier] = purchasesPlan[i];
    const it = items[itemIdx];
    const total = qty * it.purchasePrice;
    const purchase = await db.purchase.create({
      data: { itemId: it.id, qty, unitPrice: it.purchasePrice, total, date: D(date), supplier, note: null },
    });
    await db.item.update({ where: { id: it.id }, data: { stockQty: { increment: qty } } });
    await db.treasuryTransaction.create({
      data: {
        academicYearId: year1405.id,
        type: "تجری",
        source: it.type === "یونیفورم" ? "یونیفورم" : "کتاب",
        amount: total,
        date: D(date),
        refModel: "Purchase",
        refId: purchase.id,
        description: `خرید ${it.name} از ${supplier}`,
        createdByUserId: finance.id,
      },
    });
  }
  const salesPlan: [number, number, string][] = [
    // itemIdx, qty, date
    [0, 2, "2026-10-25"],
    [4, 1, "2026-10-26"],
    [1, 1, "2026-10-28"],
    [2, 2, "2026-10-30"],
    [3, 1, "2026-11-02"],
    [5, 1, "2026-11-03"],
    [7, 1, "2026-10-27"],
    [8, 1, "2026-10-27"],
    [7, 1, "2026-10-29"],
    [9, 2, "2026-10-31"],
    [6, 1, "2026-11-01"],
    [8, 1, "2026-11-04"],
    [7, 1, "2026-11-06"],
    [6, 1, "2026-11-08"],
    [9, 1, "2026-11-10"],
  ];
  const allStudents = await db.student.findMany({ where: { status: "active" }, orderBy: { studentNo: "asc" } });
  for (let i = 0; i < salesPlan.length; i++) {
    const [itemIdx, qty, date] = salesPlan[i];
    const it = items[itemIdx];
    const total = qty * it.salePrice;
    const student = allStudents[(i * 5) % allStudents.length];
    const sale = await db.sale.create({
      data: {
        studentId: student.id,
        itemId: it.id,
        qty,
        unitPrice: it.salePrice,
        total,
        date: D(date),
        receiptNo: `SL-1405-${String(i + 1).padStart(4, "0")}`,
      },
    });
    await db.item.update({ where: { id: it.id }, data: { stockQty: { decrement: qty } } });
    await db.treasuryTransaction.create({
      data: {
        academicYearId: year1405.id,
        type: "دخل",
        source: it.type === "یونیفورم" ? "یونیفورم" : "کتاب",
        amount: total,
        date: D(date),
        refModel: "Sale",
        refId: sale.id,
        description: `فروش ${it.name} رسید SL-1405-${String(i + 1).padStart(4, "0")}`,
        createdByUserId: finance.id,
      },
    });
    await db.auditLog.create({
      data: { userId: finance.id, action: "money", entity: "Sale", entityId: sale.id, detail: JSON.stringify({ amount: total, receiptNo: sale.receiptNo }) },
    });
  }

  // ================= Expenses =================
  const categoryNames = ["کرایه تعمیر", "برق و آب", "تیل جنراتور", "لوازم تحریر", "تعمیرات", "متفرقه"];
  const categories: { id: string; name: string }[] = [];
  for (const name of categoryNames) {
    categories.push(await db.expenseCategory.create({ data: { name } }));
  }
  const cat = (name: string) => categories.find((c) => c.name === name)!;
  const expensesPlan: [string, number, string, string][] = [
    ["2026-10-28", 45000, "کرایه تعمیر", "کرایه ماهانه تعمیر مکتب"],
    ["2026-11-02", 6000, "برق و آب", "برق و آب ماه عقرب"],
    ["2026-11-04", 15000, "تیل جنراتور", "تیل جنراتور برای برق"],
    ["2026-11-06", 8000, "لوازم تحریر", " chalk و لوازم معلمین"],
    ["2026-11-08", 3500, "متفرقه", "مصارف جزئی اداری"],
  ];
  for (let i = 0; i < expensesPlan.length; i++) {
    const [date, amount, catName, description] = expensesPlan[i];
    const expense = await db.expense.create({
      data: {
        categoryId: cat(catName).id,
        amount,
        date: D(date),
        description,
        voucherNo: `EXP-1405-${String(i + 1).padStart(4, "0")}`,
        createdByUserId: finance.id,
      },
    });
    await db.treasuryTransaction.create({
      data: {
        academicYearId: year1405.id,
        type: "تجری",
        source: "مصارف",
        amount,
        date: D(date),
        refModel: "Expense",
        refId: expense.id,
        description,
        createdByUserId: finance.id,
      },
    });
    await db.auditLog.create({
      data: { userId: finance.id, action: "money", entity: "Expense", entityId: expense.id, detail: JSON.stringify({ amount, voucherNo: expense.voucherNo }) },
    });
  }

  // ================= Salaries =================
  const salaryMonths: [string, number, string][] = [
    ["1405-07", staff.length, "2026-10-05"], // میزان: all paid
    ["1405-08", Math.floor(staff.length / 2), "2026-11-05"], // عقرب: 50% paid
  ];
  for (const [monthKey, paidCount, paidDate] of salaryMonths) {
    for (let i = 0; i < staff.length; i++) {
      const s = staff[i];
      const isPaid = i < paidCount;
      const salary = await db.salaryPayment.create({
        data: {
          staffId: s.id,
          academicYearId: year1405.id,
          monthKey,
          amount: s.baseSalary,
          status: isPaid ? "پرداخت‌شده" : "پرداخت‌نشده",
          paidDate: isPaid ? D(paidDate) : null,
        },
      });
      if (isPaid) {
        await db.treasuryTransaction.create({
          data: {
            academicYearId: year1405.id,
            type: "تجری",
            source: "معاشات",
            amount: s.baseSalary,
            date: D(paidDate),
            refModel: "SalaryPayment",
            refId: salary.id,
            description: `معاش ${s.name} برای ${monthKey}`,
            createdByUserId: finance.id,
          },
        });
      }
    }
  }

  // ================= Exams & marks & results =================
  const exam6 = await db.exam.create({
    data: {
      academicYearId: year1405.id,
      type: "چهارونیم‌ماهه",
      label: "امتحان چهارونیم‌ماهه صنف ششم - الف",
      maxPerSubject: 40,
      classroomId: classrooms["6الف"].id,
      examDate: D("2026-07-28"),
      status: "برگزارشده",
    },
  });
  const exam9 = await db.exam.create({
    data: {
      academicYearId: year1405.id,
      type: "چهارونیم‌ماهه",
      label: "امتحان چهارونیم‌ماهه صنف نهم - الف",
      maxPerSubject: 40,
      classroomId: classrooms["9الف"].id,
      examDate: D("2026-07-28"),
      status: "برگزارشده",
    },
  });
  await db.exam.create({
    data: {
      academicYearId: year1405.id,
      type: "سالانه",
      label: "امتحان سالانه صنف ششم - الف",
      maxPerSubject: 60,
      classroomId: classrooms["6الف"].id,
      examDate: D("2027-02-10"),
      status: "برنامه‌ریزی‌شده",
    },
  });

  const enrollmentsByClass = async (classroomId: string) =>
    db.enrollment.findMany({ where: { classroomId, status: "active" }, orderBy: { rollNo: "asc" } });

  const computeExam = async (examId: string, classroomId: string) => {
    const enrollments = await enrollmentsByClass(classroomId);
    const csList = classSubjectsByClassroom[classroomId === classrooms["6الف"].id ? "6الف" : "9الف"];
    const marksByEnrollment = new Map<string, { classSubjectId: string; marks: number }[]>();
    for (let ei = 0; ei < enrollments.length; ei++) {
      const e = enrollments[ei];
      const list: { classSubjectId: string; marks: number }[] = [];
      for (let ci = 0; ci < csList.length; ci++) {
        const marks = 24 + ((ei * 11 + ci * 5) % 17); // 24..40
        await db.examMark.create({
          data: { examId, enrollmentId: e.id, classSubjectId: csList[ci].id, marks },
        });
        list.push({ classSubjectId: csList[ci].id, marks });
      }
      marksByEnrollment.set(e.id, list);
    }
    // compute subject results + annual summary (annual not held → در جریان)
    let rankRows: { enrollmentId: string; average: number }[] = [];
    for (const e of enrollments) {
      const marks = marksByEnrollment.get(e.id) ?? [];
      let sum = 0;
      for (const cs of csList) {
        const rec = marks.find((m) => m.classSubjectId === cs.id);
        const total = rec?.marks ?? 0;
        sum += total;
        await db.subjectResult.create({
          data: {
            academicYearId: year1405.id,
            enrollmentId: e.id,
            subjectId: cs.subjectId,
            total,
            grade: total >= 86 ? "عالی" : total >= 66 ? "خوب" : total >= 40 ? "قابل" : "مردود",
            passed: total >= 40,
          },
        });
      }
      const average = csList.length > 0 ? Math.round((sum / csList.length) * 100) / 100 : 0;
      await db.studentAnnualSummary.create({
        data: {
          academicYearId: year1405.id,
          enrollmentId: e.id,
          total: sum,
          average,
          rank: 0,
          status: "در جریان",
        },
      });
      rankRows.push({ enrollmentId: e.id, average });
    }
    rankRows = rankRows.sort((a, b) => b.average - a.average);
    for (let i = 0; i < rankRows.length; i++) {
      await db.studentAnnualSummary.updateMany({
        where: { enrollmentId: rankRows[i].enrollmentId, academicYearId: year1405.id },
        data: { rank: i + 1 },
      });
    }
  };
  await computeExam(exam6.id, classrooms["6الف"].id);
  await computeExam(exam9.id, classrooms["9الف"].id);

  // ================= Message templates =================
  await db.messageTemplate.createMany({
    data: [
      {
        key: "attendance_absent",
        category: "حاضری",
        bodyDr: "احتراماً فرزندتان {{نام}} صنف {{صنف}} امروز در مکتب حاضر نبود. خواهشمند است با مکتب همکاری نمایید. — {{مکتب}}",
        bodyPs: "درناحه فرزند مو {{نام}} صنف {{صنف}} نن مکتب ته حاضر نه و. مهرباني وکړئ له مکتب سره همکاري وکړئ. — {{مکتب}}",
        bodyEn: "Dear guardian, your child {{نام}} (class {{صنف}}) was absent today. Please cooperate with the school. — {{مکتب}}",
      },
      {
        key: "fee_remaining",
        category: "فیس",
        bodyDr: "{{نام}} عزیز، فیس {{ماه}} شما به مبلغ {{مبلغ}} افغانی باقی مانده است. لطفاً به اداره مکتب پرداخت نمایید. — {{مکتب}}",
        bodyPs: "{{نام}} ګران، د {{ماه}} فیس مو به {{مبلغ}} افغانۍ پاتې ده. مهرباني وکړئ د مکتب ادارې ته تادیه کړئ. — {{مکتب}}",
        bodyEn: "Dear guardian of {{نام}}, the fee of {{ماه}} amounting {{مبلغ}} AFN remains unpaid. Please pay at the school office. — {{مکتب}}",
      },
      {
        key: "exam_result",
        category: "امتحان",
        bodyDr: "{{نام}} عزیز، نتیجه امتحان {{ماه}} صنف {{صنف}} اعلام گردید. برای دیدن نتیجه به مکتب تشریف بیاورید. — {{مکتب}}",
        bodyPs: "{{نام}} ګران، د {{ماه}} ازموینې نتیجه د {{صنف}} اعلان شو. د نتیجې لیدو لپاره مکتب ته راشئ. — {{مکتب}}",
        bodyEn: "Dear guardian of {{نام}}, the {{ماه}} exam result of class {{صنف}} is announced. Please visit the school. — {{مکتب}}",
      },
    ],
  });

  // ================= Notifications (2 ارسال‌شده، 2 صف، 1 ناکام) =================
  const unpaidInvoices = await db.feeInvoice.findMany({
    where: { monthKey: "1405-08", paidAmount: 0 },
    include: { enrollment: { include: { student: true } } },
    take: 2,
  });
  for (let i = 0; i < unpaidInvoices.length; i++) {
    const inv = unpaidInvoices[i];
    const st = inv.enrollment.student;
    await db.notification.create({
      data: {
        category: "فیس",
        audience: "والدین",
        studentId: st.id,
        classroomId: inv.classroomId,
        phone: st.guardianPhone,
        body: `احتراماً فیس ماه عقرب متعلم {{نام}} به مبلغ ${inv.amount - inv.discount} افغانی باقی مانده است. لطفاً به اداره مکتب پرداخت نمایید. — مکتب خصوصی نداالقلم`.split("{{نام}}").join(st.firstName),
        status: "ارسال‌شده",
        sentAt: D("2026-11-10"),
        createdByUserId: finance.id,
      },
    });
  }
  const class6b = classrooms["6ب"];
  await db.notification.create({
    data: {
      category: "اطلاعیه",
      audience: "والدین",
      classroomId: class6b.id,
      phone: null,
      body: "اطلاعیه: جلسه عمومی والدین و کدگذاری صنف ششم روز پنجشنبه ساعت ۱۰ بجه در سالون مکتب برگزار می‌گردد. — مکتب خصوصی نداالقلم",
      status: "صف",
      createdByUserId: admin.id,
    },
  });
  const firstEnrollment = await db.enrollment.findFirst({ include: { student: true, classroom: true } });
  await db.notification.create({
    data: {
      category: "حاضری",
      audience: "والدین",
      studentId: firstEnrollment?.studentId ?? null,
      classroomId: firstEnrollment?.classroomId ?? null,
      phone: firstEnrollment?.student.guardianPhone ?? null,
      body: `فرزندتان ${firstEnrollment?.student.firstName ?? ""} صنف ${firstEnrollment?.classroom.name ?? ""} دیروز غایب بود. — مکتب خصوصی نداالقلم`,
      status: "صف",
      createdByUserId: teacher.id,
    },
  });
  await db.notification.create({
    data: {
      category: "معاش",
      audience: "کارمندان",
      staffId: staff[0].id,
      phone: "07000000000",
      body: "معاش ماه عقرب شما تادیه گردید. — مکتب خصوصی نداالقلم",
      status: "ناکام",
      createdByUserId: finance.id,
    },
  });

  // ================= Staff documents =================
  await db.staffDocument.createMany({
    data: [
      { staffId: staff[0].id, title: "فرم معلومات شخصی", fileName: "info-abdulbaseer.pdf", note: "تکمیل شده" },
      { staffId: staff[4].id, title: "سند تحصیلی ماستری", fileName: "ma-degree-hadi.pdf", note: "تصدیق شده" },
      { staffId: staff[5].id, title: "قرارداد کاری", fileName: "contract-nasir.pdf", note: "" },
    ],
  });

  // ================= Audit (logins) =================
  await db.auditLog.create({
    data: { userId: admin.id, action: "login", entity: "User", entityId: admin.id, detail: JSON.stringify({ username: "admin", role: "ADMIN" }) },
  });
  await db.auditLog.create({
    data: { userId: owner.id, action: "login", entity: "User", entityId: owner.id, detail: JSON.stringify({ username: "owner", role: "OWNER" }) },
  });

  // ================= Summary =================
  const counts = {
    students: await db.student.count(),
    staff: await db.staff.count(),
    enrollments: await db.enrollment.count(),
    invoices: await db.feeInvoice.count(),
    payments: await db.feePayment.count(),
    exams: await db.exam.count(),
    examMarks: await db.examMark.count(),
    subjectResults: await db.subjectResult.count(),
    summaries: await db.studentAnnualSummary.count(),
    notifications: await db.notification.count(),
    treasury: await db.treasuryTransaction.count(),
    auditLogs: await db.auditLog.count(),
  };
  const treasuryRows = await db.treasuryTransaction.findMany({ select: { type: true, amount: true } });
  let balance = 0;
  for (const t of treasuryRows) balance += t.type === "دخل" ? t.amount : -t.amount;
  console.log("✅ Seed complete:");
  console.log(`   students:        ${counts.students}`);
  console.log(`   staff:           ${counts.staff}`);
  console.log(`   enrollments:     ${counts.enrollments}`);
  console.log(`   invoices:        ${counts.invoices}`);
  console.log(`   payments:        ${counts.payments}`);
  console.log(`   exams:           ${counts.exams} (marks: ${counts.examMarks})`);
  console.log(`   subjectResults:  ${counts.subjectResults}`);
  console.log(`   summaries:       ${counts.summaries}`);
  console.log(`   notifications:   ${counts.notifications}`);
  console.log(`   treasury entries:${counts.treasury}`);
  console.log(`   TREASURY BALANCE: ${balance} AFN`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
