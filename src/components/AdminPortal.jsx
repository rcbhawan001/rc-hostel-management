import { Fragment, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";

import { formatBadgeCount } from "../lib/formatBadgeCount.js";
import { formatCurrency, formatDate, formatShortDate } from "../lib/formatters";
import { currentMonthKeyLocal, recordMonthKey } from "../lib/monthKey.js";
import {
  paymentHasBalanceDue,
  paymentHistoryCardRows,
  paymentInvoiceStatusKey,
  paymentInvoiceStatusLabel,
  paymentMonthKey,
  paymentOutstandingAmount,
  pendingSubmittedAmount,
  proofStatusDisplayLabel,
  verifiedPaidCredit,
} from "../lib/paymentMath.js";
import { LoaderScreen } from "./LoaderScreen";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { Modal } from "./Modal";
import { EmptyState, MetricRing, PageHeader, SectionCard, StatCard, StatusPill } from "./ui";

const adminPages = [
  { id: "dashboard", label: "Dashboard" },
  { id: "students", label: "Students" },
  { id: "billing", label: "Billing" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
  { id: "complaints", label: "Complaints" },
  { id: "leaves", label: "Leaves" },
  { id: "notices", label: "Notices" },
];

const emptyStudentForm = {
  name: "",
  aadhaarNumber: "",
  collegeName: "",
  course: "",
  yearLabel: "",
  roomNumber: "",
  bedLabel: "",
  phone: "",
  fatherName: "",
  fatherPhone: "",
  hometown: "",
  joinedOn: "",
  securityDeposit: 0,
  monthlyRent: 0,
  balanceDue: 0,
  localGuardianName: "",
  localGuardianPhone: "",
};

const studentFormSectionCopy = {
  identity: {
    kicker: "Records",
    title: "Identity & college",
    description: "Official name, ID, and academic details as they should appear in the app.",
  },
  room: {
    kicker: "Assignment",
    title: "Room & bed",
    description: "Pick an available bed. You can change this later when the student moves.",
  },
  contact: {
    kicker: "Reach",
    title: "Contact & dates",
    description: "How we reach the student and when their stay started.",
  },
  family: {
    kicker: "Family",
    title: "Family & local guardian",
    description: "Next of kin and a local contact for emergencies.",
  },
  fees: {
    kicker: "Account",
    title: "Fees & balance",
    description: "Deposit, rent, and any opening balance on their account.",
  },
};

const studentFormFields = [
  { key: "name", label: "Full name", type: "text", section: "identity" },
  { key: "aadhaarNumber", label: "Aadhaar number", type: "text", section: "identity" },
  { key: "collegeName", label: "College name", type: "text", section: "identity" },
  { key: "course", label: "Course", type: "text", section: "identity" },
  { key: "yearLabel", label: "Year", type: "text", section: "identity" },
  { key: "roomNumber", label: "Room number", type: "select", section: "room" },
  { key: "bedLabel", label: "Bed", type: "select", section: "room" },
  { key: "phone", label: "Phone", type: "tel", section: "contact" },
  { key: "hometown", label: "Hometown", type: "text", section: "contact" },
  { key: "joinedOn", label: "Join date", type: "date", section: "contact" },
  { key: "fatherName", label: "Father's name", type: "text", section: "family" },
  { key: "fatherPhone", label: "Father's phone", type: "tel", section: "family" },
  { key: "localGuardianName", label: "Local guardian name", type: "text", full: true, section: "family" },
  { key: "localGuardianPhone", label: "Local guardian phone", type: "tel", full: true, section: "family" },
  { key: "securityDeposit", label: "Security deposit", type: "number", section: "fees" },
  { key: "monthlyRent", label: "Monthly rent", type: "number", section: "fees" },
  { key: "balanceDue", label: "Balance due", type: "number", section: "fees" },
];

const isValidSection = (section) => adminPages.some((page) => page.id === section);

const mediaOrigin = String(import.meta.env.VITE_API_URL || "")
  .replace(/\/api\/?$/i, "")
  .trim();
const toMediaUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//.test(path) || path.startsWith("data:")) return path;
  const prefix = mediaOrigin;
  return `${prefix}${path.startsWith("/") ? "" : "/"}${path}`;
};
const isImageFile = (fileNameOrPath) =>
  /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(fileNameOrPath || ""));
const isLikelyImageUrl = (value) => /^https?:\/\//i.test(String(value || ""));

function studentInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || "";
    const b = parts[parts.length - 1][0] || "";
    const pair = `${a}${b}`.toUpperCase();
    return pair || "?";
  }
  const slice = name.trim().slice(0, 2).toUpperCase();
  return slice || "?";
}

const normalize = (value) => String(value || "").trim().toLowerCase();
const includesQuery = (query, values) => {
  const cleaned = normalize(query);
  if (!cleaned) return true;
  return values.some((value) => normalize(value).includes(cleaned));
};

/** Per-student counts for admin payment accordion (one row per invoice in this tab). */
const summarizePaymentGroupForAdmin = (payments = []) => {
  let pendingVerification = 0;
  let partialPaid = 0;
  let fullyPaid = 0;
  let proofRejected = 0;
  for (const p of payments) {
    if (p.proofStatus === "pending-verification") pendingVerification += 1;
    else if (p.proofStatus === "rejected") proofRejected += 1;
    else if (paymentOutstandingAmount(p) <= 0) fullyPaid += 1;
    else partialPaid += 1;
  }
  return { pendingVerification, partialPaid, fullyPaid, proofRejected };
};

const complaintTabs = [
  { id: "open", label: "Open" },
  { id: "in-progress", label: "Approved" },
  { id: "resolved", label: "Solved" },
];

const paymentTabs = [
  { id: "pending-verification", label: "Verify" },
  { id: "verified", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const documentTabs = [
  { id: "pending", label: "Verify" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const leaveTabs = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const studentDocFilters = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "complete", label: "Completed" },
  { id: "rejected", label: "Rejected" },
];

export function AdminPortal({
  data,
  busyMessage,
  onCreateStudent,
  onUpdateStudent,
  onDeleteStudent,
  onUpdateRoom,
  onResetRoomAssignments,
  onDeleteRoomRecord,
  onDeleteAllRooms,
  onSetGlobalElectricityRate,
  onUpdateComplaint,
  onDeleteComplaint,
  onUpdateLeave,
  onReviewPayment,
  onUpdatePaymentBill,
  onUpdatePaymentBillsBulk,
  onGenerateBillingInvoices,
  onDeleteFutureInvoices,
  onAddRooms,
  onAutoAssignRooms,
  onDeletePaymentProof,
  onUpdateDocument,
  onDeleteDocument,
  onCreateNotice,
  onDeleteNotice,
}) {
  if (!data) {
    return <LoaderScreen />;
  }

  const { section } = useParams();
  const navigate = useNavigate();
  const currentPage = isValidSection(section) ? section : "dashboard";
  const isSaving = Boolean(busyMessage);

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentViewMode, setStudentViewMode] = useState("read");
  const [studentDetailTab, setStudentDetailTab] = useState("profile");
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [complaintNotes, setComplaintNotes] = useState({});
  const [leaveNotes, setLeaveNotes] = useState({});
  const [noticeForm, setNoticeForm] = useState({
    title: "",
    body: "",
    pinned: false,
  });

  const [dashboardSearch, setDashboardSearch] = useState("");
  const [dashboardVisibleCount, setDashboardVisibleCount] = useState(6);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentDocFilter, setStudentDocFilter] = useState("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  /** `YYYY-MM` or "" = all months */
  const [paymentHistoryMonth, setPaymentHistoryMonth] = useState(() => currentMonthKeyLocal());
  const [complaintHistoryMonth, setComplaintHistoryMonth] = useState(() => currentMonthKeyLocal());
  const [leaveHistoryMonth, setLeaveHistoryMonth] = useState(() => currentMonthKeyLocal());
  const [paymentTab, setPaymentTab] = useState("pending-verification");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentTab, setDocumentTab] = useState("pending");
  const [complaintSearch, setComplaintSearch] = useState("");
  const [complaintTab, setComplaintTab] = useState("open");
  const [complaintCategory, setComplaintCategory] = useState("all");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [leaveTab, setLeaveTab] = useState("pending");
  const [noticeSearch, setNoticeSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openRoomMenu, setOpenRoomMenu] = useState(null);
  const [billingMonthKey, setBillingMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [billingRoom, setBillingRoom] = useState("");
  const [billingDrafts, setBillingDrafts] = useState({});
  const [billingAutoCalc, setBillingAutoCalc] = useState(true);

  const [modalState, setModalState] = useState({
    open: false,
    mode: "default",
    title: "",
    description: "",
    noteLabel: "",
    note: "",
    confirmLabel: "Confirm",
    danger: false,
    onConfirm: null,
    addRoomFloor: "",
    addRoomMeter: "",
  });

  const [previewState, setPreviewState] = useState({
    open: false,
    url: "",
    fileName: "",
    isImage: false,
  });

  const [roomToolsOpen, setRoomToolsOpen] = useState(false);
  const [globalElectricityRate, setGlobalElectricityRate] = useState(() => {
    const first = data.rooms?.[0];
    return first ? String(first.electricityRatePerUnit ?? 0) : "0";
  });


  const selectedStudent = useMemo(
    () => data.students.find((student) => student.studentId === selectedStudentId) || null,
    [data.students, selectedStudentId],
  );

  const studentById = useMemo(
    () => new Map(data.students.map((student) => [student.studentId, student])),
    [data.students],
  );

  /** Students whose documents are not fully verified (sidebar: Students). */
  const studentsWithPendingDocumentsCount = useMemo(
    () => data.students.filter((s) => String(s.documentStatus || "") !== "complete").length,
    [data.students],
  );

  /** Individual document uploads awaiting admin review (sidebar: Documents). */
  const pendingDocumentReviewsCount = useMemo(
    () =>
      data.students.reduce((sum, s) => {
        const docs = Array.isArray(s.documents) ? s.documents : [];
        return sum + docs.filter((d) => String(d.status || "") === "pending").length;
      }, 0),
    [data.students],
  );

  /** Complaints still in "open" — student request awaiting admin action (sidebar: Complaints). */
  const complaintsPendingApprovalCount = useMemo(
    () => data.complaints.filter((c) => c.status === "open").length,
    [data.complaints],
  );

  const adminNavBadgeCount = (pageId) => {
    switch (pageId) {
      case "payments":
        return Number(data.summary.paymentProofPending || 0);
      case "complaints":
        return complaintsPendingApprovalCount;
      case "leaves":
        return Number(data.summary.pendingLeaves || 0);
      case "documents":
        return pendingDocumentReviewsCount;
      case "students":
        return studentsWithPendingDocumentsCount;
      default:
        return 0;
    }
  };

  const bedLabelsByRoom = useMemo(() => {
    const map = new Map();
    data.students.forEach((student) => {
      const roomNumber = String(student.roomNumber || "");
      if (!roomNumber) return;
      if (!map.has(roomNumber)) map.set(roomNumber, new Set());
      map.get(roomNumber).add(String(student.bedLabel || ""));
    });
    return map;
  }, [data.students]);

  const roomByNumber = useMemo(
    () => new Map(data.rooms.map((room) => [String(room.roomNumber), room])),
    [data.rooms],
  );

  const availableRooms = useMemo(() => {
    const rooms = data.rooms
      .filter((room) => Number(room.totalBeds || 0) > Number(room.occupiedBeds || 0))
      .map((room) => String(room.roomNumber));

    // When editing, keep current room visible even if it is full.
    const currentRoom = selectedStudent?.roomNumber ? String(selectedStudent.roomNumber) : "";
    if (currentRoom && !rooms.includes(currentRoom)) {
      rooms.unshift(currentRoom);
    }

    return rooms.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [data.rooms, selectedStudent]);

  const availableBedsForSelectedRoom = useMemo(() => {
    const roomNumber = String(studentForm.roomNumber || selectedStudent?.roomNumber || "");
    if (!roomNumber) return [];
    const room = roomByNumber.get(roomNumber);
    const totalBeds = Math.max(0, Math.min(2, Number(room?.totalBeds || 0)));
    const base = totalBeds === 2 ? ["A", "B"] : totalBeds === 1 ? ["A"] : [];

    const occupied = bedLabelsByRoom.get(roomNumber) || new Set();
    const allowExisting = selectedStudent?.roomNumber === roomNumber ? String(selectedStudent?.bedLabel || "") : "";

    return base
      .filter((label) => !occupied.has(label) || label === allowExisting)
      .sort((a, b) => a.localeCompare(b));
  }, [bedLabelsByRoom, roomByNumber, selectedStudent, studentForm.roomNumber]);

  const allRoomNumbersSorted = useMemo(
    () =>
      [...data.rooms]
        .map((room) => String(room.roomNumber))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [data.rooms],
  );

  const roomOptionsForForm = useMemo(() => {
    if (selectedStudent && studentViewMode === "edit") {
      return allRoomNumbersSorted;
    }
    return availableRooms;
  }, [selectedStudent, studentViewMode, availableRooms, allRoomNumbersSorted]);

  const allBedsForSelectedRoom = useMemo(() => {
    const roomNumber = String(studentForm.roomNumber || selectedStudent?.roomNumber || "");
    if (!roomNumber) return [];
    const room = roomByNumber.get(roomNumber);
    const totalBeds = Math.max(0, Math.min(2, Number(room?.totalBeds || 0)));
    return totalBeds === 2 ? ["A", "B"] : totalBeds === 1 ? ["A"] : [];
  }, [roomByNumber, studentForm.roomNumber, selectedStudent]);

  const bedOptionsForForm = useMemo(() => {
    if (selectedStudent && studentViewMode === "edit") {
      return allBedsForSelectedRoom;
    }
    return availableBedsForSelectedRoom;
  }, [selectedStudent, studentViewMode, allBedsForSelectedRoom, availableBedsForSelectedRoom]);

  useEffect(() => {
    if (!isValidSection(section)) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [section, navigate]);

  useEffect(() => {
    if (selectedStudent) {
      setStudentViewMode("read");
      setStudentDetailTab("profile");
      setStudentForm({
        name: selectedStudent.name || "",
        aadhaarNumber: selectedStudent.aadhaarNumber || "",
        collegeName: selectedStudent.collegeName || selectedStudent.collegeId || "",
        course: selectedStudent.course || "",
        yearLabel: selectedStudent.yearLabel || "",
        roomNumber: selectedStudent.roomNumber || "",
        bedLabel: selectedStudent.bedLabel || "",
        phone: selectedStudent.phone || "",
        fatherName: selectedStudent.fatherName || selectedStudent.guardianName || "",
        fatherPhone: selectedStudent.fatherPhone || selectedStudent.guardianPhone || "",
        hometown: selectedStudent.hometown || "",
        joinedOn: selectedStudent.joinedOn || "",
        securityDeposit: Number(selectedStudent.securityDeposit || 0),
        monthlyRent: Number(selectedStudent.monthlyRent || 0),
        balanceDue: Number(selectedStudent.balanceDue || 0),
        localGuardianName: selectedStudent.localGuardianName || selectedStudent.emergencyContactName || "",
        localGuardianPhone: selectedStudent.localGuardianPhone || selectedStudent.emergencyContactPhone || "",
      });
      return;
    }

    setStudentForm(emptyStudentForm);
  }, [selectedStudent]);

  useEffect(() => {
    if (selectedStudentId && !studentById.has(selectedStudentId)) {
      setSelectedStudentId("");
    }
  }, [selectedStudentId, studentById]);

  // Rooms are now created via Billing -> Add rooms.

  const overviewStudents = useMemo(
    () =>
      data.students
        .filter((student) =>
          includesQuery(dashboardSearch, [
            student.name,
            student.roomNumber,
            student.phone,
            student.studentId,
            student.collegeName,
            student.collegeId,
          ]),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data.students, dashboardSearch],
  );

  const visibleOverviewStudents = dashboardSearch
    ? overviewStudents
    : overviewStudents.slice(0, dashboardVisibleCount);

  const canLoadMoreOverview = !dashboardSearch && dashboardVisibleCount < overviewStudents.length;

  const filteredStudents = useMemo(
    () =>
      data.students
        .filter((student) =>
          includesQuery(studentSearch, [
            student.name,
            student.roomNumber,
            student.phone,
            student.studentId,
            student.collegeId,
          ]),
        )
        .filter((student) => {
          if (studentDocFilter === "all") return true;
          if (studentDocFilter === "approved") return student.documentStatus === "complete";
          return student.documentStatus === studentDocFilter;
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data.students, studentSearch, studentDocFilter],
  );

  const paymentTabCounts = useMemo(
    () =>
      Object.fromEntries(
        paymentTabs.map((tab) => [
          tab.id,
          data.payments.filter((payment) => payment.proofStatus === tab.id).length,
        ]),
      ),
    [data.payments],
  );

  const billingInvoices = useMemo(() => {
    const monthKey = String(billingMonthKey || "");
    const byInvoiceId = new Map(data.payments.map((p) => [p.invoiceId, p]));
    const filtered = data.payments
      .filter((p) => (p.monthKey ? p.monthKey === monthKey : String(p.dueDate || "").startsWith(monthKey)))
      .filter((p) => {
        if (!billingRoom) return true;
        const student = studentById.get(p.studentId);
        return String(student?.roomNumber || "") === String(billingRoom);
      })
      .map((p) => ({
        payment: p,
        student: studentById.get(p.studentId) || null,
      }))
      .sort((a, b) => String(a.student?.roomNumber || "").localeCompare(String(b.student?.roomNumber || "")));

    return { filtered, byInvoiceId };
  }, [billingMonthKey, billingRoom, data.payments, studentById]);

  const billingCalendarMonth = currentMonthKeyLocal();
  const billingMonthStats = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const { payment } of billingInvoices.filtered) {
      count += 1;
      total += Number(payment.totalAmount || 0);
    }
    return { count, total };
  }, [billingInvoices.filtered]);
  const canDeleteSelectedBillingMonth = String(billingMonthKey || "") > String(billingCalendarMonth || "");

  useEffect(() => {
    // initialize drafts for visible invoices
    const next = {};
    billingInvoices.filtered.forEach(({ payment }) => {
      next[payment.invoiceId] = {
        electricityUnits: String(payment.electricityUnits ?? ""),
        electricityAmount: String(payment.electricityAmount ?? ""),
        lateFee: String(payment.lateFee ?? ""),
        fineAmount: String(payment.fineAmount ?? 0),
        fineReason: String(payment.fineReason ?? ""),
      };
    });
    setBillingDrafts(next);
  }, [billingInvoices.filtered]);

  const paymentGroups = useMemo(() => {
    const filtered = data.payments
      .filter((payment) => payment.proofStatus === paymentTab)
      .filter((payment) => {
        if (!paymentHistoryMonth) return true;
        return paymentMonthKey(payment) === paymentHistoryMonth;
      })
      .filter((payment) => {
        const student = studentById.get(payment.studentId);
        return includesQuery(paymentSearch, [
          payment.studentName,
          payment.monthLabel,
          payment.paymentReference,
          payment.invoiceId,
          student?.roomNumber,
          student?.phone,
          student?.collegeId,
        ]);
      });

    const groups = new Map();
    filtered.forEach((payment) => {
      if (!groups.has(payment.studentId)) {
        groups.set(payment.studentId, {
          student: studentById.get(payment.studentId) || null,
          payments: [],
        });
      }
      groups.get(payment.studentId).payments.push(payment);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        payments: [...group.payments].sort(
          (left, right) => new Date(right.dueDate) - new Date(left.dueDate),
        ),
      }))
      .sort((left, right) =>
        String(left.student?.name || "").localeCompare(String(right.student?.name || "")),
      );
  }, [data.payments, paymentHistoryMonth, paymentSearch, paymentTab, studentById]);

  function handleBillEdit(payment) {
    const currentFineReason = payment.fineReason || "";
    const billDraft = {
      rentAmount: String(payment.rentAmount ?? ""),
      electricityUnits: String(payment.electricityUnits ?? ""),
      electricityAmount: String(payment.electricityAmount ?? ""),
      lateFee: String(payment.lateFee ?? ""),
      fineAmount: String(payment.fineAmount ?? 0),
      fineReason: currentFineReason,
      dueDate: payment.dueDate || "",
      monthLabel: payment.monthLabel || "",
    };

    openModal({
      title: `Update bill snapshot (${payment.studentName} - ${payment.monthLabel})`,
      noteLabel: "Bill details (JSON)",
      note: JSON.stringify(billDraft, null, 2),
      confirmLabel: "Update bill",
      onConfirm: async (note) => {
        let parsed = null;
        try {
          parsed = JSON.parse(note);
        } catch (_error) {
          throw new Error("Please provide valid JSON for bill details.");
        }
        await onUpdatePaymentBill(payment.invoiceId, parsed);
      },
    });
  }

  const allStudentDocuments = useMemo(
    () =>
      data.students.flatMap((student) =>
        student.documents.map((document) => ({
          ...document,
          studentId: student.studentId,
          studentName: student.name,
          roomNumber: student.roomNumber,
          studentPhone: student.phone,
          studentCollegeName: student.collegeName || student.collegeId || "",
        })),
      ),
    [data.students],
  );

  const documentTabCounts = useMemo(
    () =>
      Object.fromEntries(
        documentTabs.map((tab) => [
          tab.id,
          allStudentDocuments.filter((document) => document.status === tab.id).length,
        ]),
      ),
    [allStudentDocuments],
  );

  const documentGroups = useMemo(() => {
    const filtered = allStudentDocuments
      .filter((document) => document.status === documentTab)
      .filter((document) =>
        includesQuery(documentSearch, [
          document.studentName,
          document.roomNumber,
          document.studentPhone,
          document.studentCollegeName,
          document.label,
          document.fileName,
        ]),
      );

    const groups = new Map();
    filtered.forEach((document) => {
      if (!groups.has(document.studentId)) {
        groups.set(document.studentId, {
          student: studentById.get(document.studentId) || null,
          documents: [],
        });
      }
      groups.get(document.studentId).documents.push(document);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        documents: [...group.documents].sort(
          (left, right) => new Date(right.uploadedAt || 0) - new Date(left.uploadedAt || 0),
        ),
      }))
      .sort((left, right) =>
        String(left.student?.name || "").localeCompare(String(right.student?.name || "")),
      );
  }, [allStudentDocuments, documentSearch, documentTab, studentById]);

  const complaintCategories = useMemo(
    () =>
      [...new Set(data.complaints.map((complaint) => complaint.category).filter(Boolean))].sort(),
    [data.complaints],
  );

  const complaintTabCounts = useMemo(
    () =>
      Object.fromEntries(
        complaintTabs.map((tab) => [tab.id, data.complaints.filter((complaint) => complaint.status === tab.id).length]),
      ),
    [data.complaints],
  );

  const filteredComplaints = useMemo(
    () =>
      data.complaints
        .filter((complaint) => complaint.status === complaintTab)
        .filter((complaint) => recordMonthKey(complaint.createdAt) === complaintHistoryMonth)
        .filter((complaint) => complaintCategory === "all" || complaint.category === complaintCategory)
        .filter((complaint) =>
          includesQuery(complaintSearch, [
            complaint.studentName,
            complaint.roomNumber,
            complaint.category,
            complaint.title,
            complaint.description,
          ]),
        )
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    [data.complaints, complaintCategory, complaintHistoryMonth, complaintSearch, complaintTab],
  );

  const leaveTabCounts = useMemo(
    () =>
      Object.fromEntries(
        leaveTabs.map((tab) => [
          tab.id,
          data.leaveRequests.filter((leave) => leave.status === tab.id).length,
        ]),
      ),
    [data.leaveRequests],
  );

  const filteredLeaves = useMemo(
    () =>
      data.leaveRequests
        .filter((leave) => leave.status === leaveTab)
        .filter((leave) => {
          if (!leaveHistoryMonth) return true;
          return recordMonthKey(leave.createdAt) === leaveHistoryMonth;
        })
        .filter((leave) =>
          includesQuery(leaveSearch, [leave.studentName, leave.roomNumber, leave.reason, leave.studentId]),
        )
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    [data.leaveRequests, leaveHistoryMonth, leaveSearch, leaveTab],
  );

  const filteredNotices = useMemo(
    () =>
      [...data.notices]
        .filter((notice) =>
          includesQuery(noticeSearch, [notice.title, notice.body, notice.audience]),
        )
        .sort((left, right) => {
          if (left.pinned !== right.pinned) {
            return left.pinned ? -1 : 1;
          }
          return new Date(right.publishedAt) - new Date(left.publishedAt);
        }),
    [data.notices, noticeSearch],
  );

  function openModal(config) {
    setModalState({
      open: true,
      mode: config.mode || "default",
      title: config.title,
      description: config.description || "",
      noteLabel: config.noteLabel || "",
      note: config.note || "",
      confirmLabel: config.confirmLabel || "Confirm",
      danger: Boolean(config.danger),
      onConfirm: config.onConfirm || null,
      addRoomFloor: config.addRoomFloor ?? "",
      addRoomMeter: config.addRoomMeter ?? "",
    });
  }

  function closeModal() {
    setModalState({
      open: false,
      mode: "default",
      title: "",
      description: "",
      noteLabel: "",
      note: "",
      confirmLabel: "Confirm",
      danger: false,
      onConfirm: null,
      addRoomFloor: "",
      addRoomMeter: "",
    });
  }

  async function confirmModal() {
    if (modalState.onConfirm) {
      try {
        if (modalState.mode === "addRooms") {
          await modalState.onConfirm({
            note: modalState.note,
            floorLabel: modalState.addRoomFloor,
            electricityMeterId: modalState.addRoomMeter,
          });
        } else {
          await modalState.onConfirm(modalState.note);
        }
      } catch (_error) {
        return;
      }
    }
    closeModal();
  }

  function openPreview(path, fileName) {
    const resolved = toMediaUrl(path);
    setPreviewState({
      open: true,
      url: resolved,
      fileName: fileName || "file",
      isImage: isImageFile(fileName || path),
    });
  }

  function closePreview() {
    setPreviewState({
      open: false,
      url: "",
      fileName: "",
      isImage: false,
    });
  }


  function toStudentPayload() {
    return {
      ...studentForm,
      securityDeposit: Number(studentForm.securityDeposit || 0),
      monthlyRent: Number(studentForm.monthlyRent || 0),
      balanceDue: Number(studentForm.balanceDue || 0),
    };
  }

  async function handleStudentSubmit(event) {
    event.preventDefault();
    const payload = toStudentPayload();

    if (selectedStudent) {
      const success = await onUpdateStudent(selectedStudent.studentId, payload);
      if (success) {
        setStudentViewMode("read");
      }
      return;
    }

    const created = await onCreateStudent(payload);
    if (created) {
      setStudentForm(emptyStudentForm);
      setStudentViewMode("read");
      setSelectedStudentId(created.studentId);
    }
  }

  function handleCancelStudentEdit() {
    if (selectedStudent) {
      setStudentForm({
        name: selectedStudent.name || "",
        aadhaarNumber: selectedStudent.aadhaarNumber || "",
        collegeName: selectedStudent.collegeName || selectedStudent.collegeId || "",
        course: selectedStudent.course || "",
        yearLabel: selectedStudent.yearLabel || "",
        roomNumber: selectedStudent.roomNumber || "",
        bedLabel: selectedStudent.bedLabel || "",
        phone: selectedStudent.phone || "",
        fatherName: selectedStudent.fatherName || selectedStudent.guardianName || "",
        fatherPhone: selectedStudent.fatherPhone || selectedStudent.guardianPhone || "",
        hometown: selectedStudent.hometown || "",
        joinedOn: selectedStudent.joinedOn || "",
        securityDeposit: Number(selectedStudent.securityDeposit || 0),
        monthlyRent: Number(selectedStudent.monthlyRent || 0),
        balanceDue: Number(selectedStudent.balanceDue || 0),
        localGuardianName: selectedStudent.localGuardianName || selectedStudent.emergencyContactName || "",
        localGuardianPhone: selectedStudent.localGuardianPhone || selectedStudent.emergencyContactPhone || "",
      });
      setStudentViewMode("read");
      return;
    }
    setStudentForm(emptyStudentForm);
    setStudentViewMode("read");
  }

  function handleSelectStudent(studentId) {
    setSelectedStudentId(studentId);
  }

  function handleStartNewStudent() {
    setSelectedStudentId("");
    setStudentForm(emptyStudentForm);
    setStudentViewMode("edit");
    setStudentDetailTab("profile");
  }

  function handleDeleteStudent(studentId) {
    openModal({
      title: "Delete this student and linked records?",
      confirmLabel: "Delete student",
      danger: true,
      onConfirm: async () => {
        const success = await onDeleteStudent(studentId);
        if (success && selectedStudentId === studentId) {
          setSelectedStudentId("");
          setStudentForm(emptyStudentForm);
        }
      },
    });
  }

  function handleAddRooms() {
    openModal({
      mode: "addRooms",
      title: "Add room",
      noteLabel: "Room number",
      note: "",
      confirmLabel: "Add room",
      addRoomFloor: "",
      addRoomMeter: "",
      onConfirm: async ({ note, floorLabel, electricityMeterId }) => {
        const parts = String(note || "")
          .split(/[\n,]+/g)
          .map((value) => value.trim())
          .filter(Boolean);
        if (!parts.length) {
          throw new Error("Enter a room number.");
        }
        if (parts.length > 1) {
          throw new Error("Add one room at a time.");
        }
        await onAddRooms(parts, { floorLabel, electricityMeterId });
      },
    });
  }

  function handleAutoAssignRooms() {
    openModal({
      title: "Auto-assign rooms to all students?",
      noteLabel: "Type ASSIGN to confirm (Room 1–25, Bed A/B)",
      note: "",
      confirmLabel: "Auto assign",
      danger: true,
      onConfirm: async (note) => {
        if (String(note || "").trim().toUpperCase() !== "ASSIGN") {
          throw new Error("Please type ASSIGN to confirm.");
        }
        await onAutoAssignRooms?.(1, 25);
      },
    });
  }

  function handleComplaintUpdate(complaintId, status) {
    openModal({
      title: `Move complaint to ${status}?`,
      noteLabel: "Admin note",
      note: complaintNotes[complaintId] || "",
      confirmLabel: "Update complaint",
      onConfirm: async (note) => onUpdateComplaint(complaintId, { status, adminNote: note }),
    });
  }

  function handleDeleteComplaint(complaintId) {
    openModal({
      title: "Delete this complaint permanently?",
      confirmLabel: "Delete complaint",
      danger: true,
      onConfirm: async () => onDeleteComplaint(complaintId),
    });
  }

  function handleLeaveUpdate(leaveId, status) {
    openModal({
      title: `Move leave request to ${status}?`,
      noteLabel: "Admin note",
      note: leaveNotes[leaveId] || "",
      confirmLabel: "Update leave",
      onConfirm: async (note) => onUpdateLeave(leaveId, { status, adminNote: note }),
    });
  }

  function handlePaymentReview(invoiceId, status) {
    openModal({
      title: `${status === "verified" ? "Approve" : "Reject"} this payment proof?`,
      noteLabel: "Review note",
      confirmLabel: status === "verified" ? "Approve proof" : "Reject proof",
      onConfirm: async (note) => onReviewPayment(invoiceId, { status, reviewNote: note }),
    });
  }

  function handleDeletePaymentProof(invoiceId) {
    openModal({
      title: "Delete this payment proof?",
      confirmLabel: "Delete proof",
      danger: true,
      onConfirm: async () => onDeletePaymentProof(invoiceId),
    });
  }

  function handleDocumentReview(studentId, documentId, status) {
    openModal({
      title: `Set document as ${status}?`,
      noteLabel: "Review note",
      confirmLabel: "Update document",
      onConfirm: async (note) => onUpdateDocument(studentId, documentId, { status, reviewNote: note }),
    });
  }

  function handleDeleteDocument(studentId, documentId) {
    openModal({
      title: "Delete this uploaded document?",
      confirmLabel: "Delete document",
      danger: true,
      onConfirm: async () => onDeleteDocument(studentId, documentId),
    });
  }

  async function handleNoticeSubmit(event) {
    event.preventDefault();
    const success = await onCreateNotice(noticeForm);
    if (success) {
      setNoticeForm({
        title: "",
        body: "",
        pinned: false,
      });
    }
  }

  function handleRoomUpdateMeter(room) {
    openModal({
      title: `Update meter · Room ${room.roomNumber}`,
      noteLabel: "Electricity meter ID",
      note: room.electricityMeterId || "",
      confirmLabel: "Save meter ID",
      onConfirm: async (note) =>
        onUpdateRoom(room.roomNumber, { electricityMeterId: String(note || "").trim() }),
    });
  }

  function handleRoomResetAssignments(room) {
    openModal({
      title: `Reset room ${room.roomNumber}?`,
      description:
        "Unassigns every resident from this room and frees all beds (student profiles stay; room and bed fields cleared).",
      confirmLabel: "Reset room",
      danger: true,
      onConfirm: async () => onResetRoomAssignments(room.roomNumber),
    });
  }

  function handleRoomDeleteRecord(room) {
    openModal({
      title: `Delete room ${room.roomNumber}?`,
      noteLabel: "Type DELETE to remove this room from the hostel list",
      note: "",
      confirmLabel: "Delete room",
      danger: true,
      onConfirm: async (note) => {
        if (String(note || "").trim() !== "DELETE") {
          window.alert("Type DELETE in the box exactly to confirm.");
          throw new Error("aborted");
        }
        await onDeleteRoomRecord(room.roomNumber, note);
      },
    });
  }

  function handleDeleteAllRooms() {
    openModal({
      title: "Delete all rooms?",
      description:
        "Removes every room from the building list and clears room and bed on all students. Student profiles, payments, and other records stay.",
      noteLabel: "Type DELETE to confirm",
      note: "",
      confirmLabel: "Delete all rooms",
      danger: true,
      onConfirm: async (note) => {
        if (String(note || "").trim() !== "DELETE") {
          window.alert("Type DELETE in the box exactly to confirm.");
          throw new Error("aborted");
        }
        await onDeleteAllRooms(note);
      },
    });
  }

  function handleDeleteNotice(noticeId) {
    openModal({
      title: "Delete this notice from board?",
      confirmLabel: "Delete notice",
      danger: true,
      onConfirm: async () => onDeleteNotice(noticeId),
    });
  }

  function handleConfirmDeleteFutureInvoices(scope) {
    const selectedOnly = scope === "selected";
    openModal({
      title: selectedOnly ? `Remove invoices for ${billingMonthKey}?` : "Remove all future-month invoices?",
      description: selectedOnly
        ? `Deletes every invoice row stored under month ${billingMonthKey}. The server only allows this when that month is after the current calendar month.`
        : "Deletes every invoice whose billing month is after the current calendar month on the server. Use this if you generated next month by mistake. This month and earlier months are not removed.",
      noteLabel: "Type DELETE to confirm",
      note: "",
      confirmLabel: "Remove invoices",
      danger: true,
      onConfirm: async (note) => {
        if (String(note || "").trim() !== "DELETE") {
          window.alert("Type DELETE in the box exactly to confirm.");
          throw new Error("aborted");
        }
        await onDeleteFutureInvoices?.(selectedOnly ? { monthKey: billingMonthKey } : {});
      },
    });
  }

  function renderBillingInvoiceEditor(payment, student) {
    const draft = billingDrafts[payment.invoiceId] || {};
    const room = student?.roomNumber
      ? data.rooms.find((r) => String(r.roomNumber) === String(student.roomNumber))
      : null;
    const rate = Number(room?.electricityRatePerUnit || 0);

    const onUnitsChange = (value) => {
      const computed = Math.max(0, Number(value || 0)) * Math.max(0, rate);
      setBillingDrafts((current) => {
        const prev = current[payment.invoiceId] || {};
        return {
          ...current,
          [payment.invoiceId]: {
            ...prev,
            electricityUnits: value,
            electricityAmount: billingAutoCalc ? String(computed) : prev.electricityAmount,
          },
        };
      });
    };

    return (
      <>
        <div className="billing-field">
          <span className="billing-field-label">Electricity units</span>
          <input
            type="number"
            min="0"
            className="billing-input"
            value={draft.electricityUnits ?? ""}
            disabled={isSaving}
            onChange={(e) => onUnitsChange(e.target.value)}
          />
        </div>
        <div className="billing-field">
          <span className="billing-field-label">Electricity ₹</span>
          <input
            type="number"
            min="0"
            className="billing-input"
            value={draft.electricityAmount ?? ""}
            disabled={isSaving}
            onChange={(e) =>
              setBillingDrafts((c) => ({
                ...c,
                [payment.invoiceId]: { ...c[payment.invoiceId], electricityAmount: e.target.value },
              }))
            }
          />
        </div>
        <div className="billing-field">
          <span className="billing-field-label">Late fee</span>
          <input
            type="number"
            min="0"
            className="billing-input"
            value={draft.lateFee ?? ""}
            disabled={isSaving}
            onChange={(e) =>
              setBillingDrafts((c) => ({
                ...c,
                [payment.invoiceId]: { ...c[payment.invoiceId], lateFee: e.target.value },
              }))
            }
          />
        </div>
        <div className="billing-field">
          <span className="billing-field-label">Fine</span>
          <input
            type="number"
            min="0"
            className="billing-input"
            value={draft.fineAmount ?? ""}
            disabled={isSaving}
            onChange={(e) =>
              setBillingDrafts((c) => ({
                ...c,
                [payment.invoiceId]: { ...c[payment.invoiceId], fineAmount: e.target.value },
              }))
            }
          />
        </div>
        <div className="billing-field billing-field--full">
          <span className="billing-field-label">Fine reason</span>
          <input
            type="text"
            className="billing-input"
            value={draft.fineReason ?? ""}
            disabled={isSaving}
            onChange={(e) =>
              setBillingDrafts((c) => ({
                ...c,
                [payment.invoiceId]: { ...c[payment.invoiceId], fineReason: e.target.value },
              }))
            }
          />
        </div>
        <div className="billing-card-actions">
          <button
            type="button"
            className="button button-primary billing-btn-save"
            disabled={isSaving}
            onClick={() => {
              const d = billingDrafts[payment.invoiceId] || {};
              onUpdatePaymentBill(payment.invoiceId, {
                electricityUnits: Number(d.electricityUnits || 0),
                electricityAmount: Number(d.electricityAmount || 0),
                lateFee: Number(d.lateFee || 0),
                fineAmount: Number(d.fineAmount || 0),
                fineReason: String(d.fineReason || ""),
              });
            }}
          >
            {isSaving ? "Saving…" : "Save row"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="page-stack">
      <div className="portal-toprow">
        <div className="portal-toprow-title">{adminPages.find((p) => p.id === currentPage)?.label || "Admin"}</div>
        <div className="portal-toprow-actions">
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open admin menu"
          >
            Menu
          </button>
          <StatusPill status={data.meta.storageMode === "mongo" ? "approved" : "pending"}>
            {data.meta.storageMode === "mongo" ? "Live" : "Demo"}
          </StatusPill>
          {busyMessage ? <StatusPill status="in-progress">{busyMessage}</StatusPill> : null}
        </div>
      </div>

      <div className="portal-layout">
        <aside className="portal-sidebar">
          {adminPages.map((page) => {
            const badgeText = formatBadgeCount(adminNavBadgeCount(page.id));
            return (
              <NavLink
                key={page.id}
                to={`/admin/${page.id}`}
                className={({ isActive }) => `portal-sidebar-link ${isActive ? "active" : ""}`}
              >
                <span className="portal-sidebar-link-label">{page.label}</span>
                {badgeText ? <span className="nav-count-badge">{badgeText}</span> : null}
              </NavLink>
            );
          })}
        </aside>

        <div className="portal-content">
          {currentPage === "dashboard" ? (
            <div className="page-stack">
              <div className="stats-grid">
                <StatCard
                  label="Occupied beds"
                  value={`${data.summary.occupiedBeds}/${data.summary.totalBeds}`}
                  helper="Auto-synced from student room assignments"
                  tone="warm"
                />
                <StatCard
                  label="Residents"
                  value={data.summary.activeStudents}
                  helper="Total student profiles"
                  tone="sage"
                />
                <StatCard
                  label="Outstanding dues"
                  value={formatCurrency(data.summary.outstandingAmount)}
                  helper={`${data.summary.pendingPayments} invoices pending`}
                  tone="rose"
                />
                <StatCard
                  label="Open work"
                  value={data.summary.openComplaints}
                  helper={`${data.summary.paymentProofPending} payment proofs pending`}
                  tone="ink"
                />
              </div>

              <div className="dashboard-grid">
                <div className="dashboard-col">
                  <SectionCard title="Occupancy">
                    <MetricRing
                      label="Overall occupancy"
                      value={data.summary.occupancyRate}
                      subtext={`${data.summary.availableBeds} beds available`}
                    />
                    <div className="room-grid">
                      {data.rooms.map((room) => (
                        <article key={room.roomNumber} className="room-card">
                          <div className="room-card-top room-card-top--with-menu">
                            <div>
                              <h3>Room {room.roomNumber}</h3>
                              <span className="room-card-floor">{room.floorLabel}</span>
                            </div>
                            <div className="room-card-menu-wrap">
                              <button
                                type="button"
                                className="room-card-dots"
                                aria-haspopup="true"
                                aria-label={`Room ${room.roomNumber} actions`}
                                disabled={isSaving}
                                onClick={() =>
                                  setOpenRoomMenu((current) =>
                                    current === room.roomNumber ? null : room.roomNumber,
                                  )
                                }
                              >
                                ⋮
                              </button>
                              {openRoomMenu === room.roomNumber ? (
                                <div className="room-card-dropdown" role="menu">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="room-card-dropdown-item"
                                    disabled={isSaving}
                                    onClick={() => {
                                      setOpenRoomMenu(null);
                                      handleRoomUpdateMeter(room);
                                    }}
                                  >
                                    Update meter ID
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="room-card-dropdown-item"
                                    disabled={isSaving}
                                    onClick={() => {
                                      setOpenRoomMenu(null);
                                      handleRoomResetAssignments(room);
                                    }}
                                  >
                                    Reset room (unassign beds)
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="room-card-dropdown-item room-card-dropdown-item--danger"
                                    disabled={isSaving}
                                    onClick={() => {
                                      setOpenRoomMenu(null);
                                      handleRoomDeleteRecord(room);
                                    }}
                                  >
                                    Delete room…
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <strong>
                            {room.occupiedBeds}/{room.totalBeds} occupied
                          </strong>
                          <div className="meter-track">
                            <div
                              className="meter-fill"
                              style={{
                                width: `${Math.round((room.occupiedBeds / room.totalBeds) * 100)}%`,
                              }}
                            />
                          </div>
                          {room.description ? <p>{room.description}</p> : null}
                        </article>
                      ))}
                    </div>
                  </SectionCard>
                </div>

                <div className="dashboard-col">
                  <SectionCard
                    title="Room setup"
                    action={
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setRoomToolsOpen(true)}
                        disabled={isSaving}
                      >
                        Room tools
                      </button>
                    }
                  >
                    <p className="plain-empty">
                      Add rooms one at a time, set electricity rate, auto-assign beds, or delete all rooms (with
                      confirmation).
                    </p>
                  </SectionCard>

                  <SectionCard
                    title="Students"
                    action={
                      <input
                        className="search-input"
                        type="search"
                        placeholder="Search students"
                        value={dashboardSearch}
                        onChange={(event) => setDashboardSearch(event.target.value)}
                      />
                    }
                  >
                    <div className="stack-list">
                      {visibleOverviewStudents.map((student) => {
                        const dashThumb = student.profilePhotoUrl ? toMediaUrl(student.profilePhotoUrl) : "";
            const dashImg = dashThumb && (isImageFile(dashThumb) || isLikelyImageUrl(dashThumb));
                        return (
                        <article key={student.studentId} className="resident-card">
                          <div className="mini-card-top resident-card-top">
                            <div
                              className={`resident-card-avatar${dashImg ? " resident-card-avatar--photo" : ""}`}
                              aria-hidden
                            >
                              {dashImg ? <img src={dashThumb} alt="" /> : <span>{studentInitials(student.name)}</span>}
                            </div>
                            <div className="resident-card-top-copy">
                              <h3>{student.name}</h3>
                              <StatusPill status={student.documentStatus}>{student.documentStatus}</StatusPill>
                            </div>
                          </div>
                          <p>
                            Room {student.roomNumber} / {student.bedLabel} · {student.phone}
                          </p>
                          <p className="plain-empty">
                            ID: <strong>{student.studentId}</strong>
                            {student.collegeName || student.collegeId
                              ? ` · College: ${student.collegeName || student.collegeId}`
                              : ""}
                          </p>
                          <div className="action-chip-row">
                            <button
                              type="button"
                              className="action-chip"
                              onClick={() => {
                                handleSelectStudent(student.studentId);
                                navigate("/admin/students");
                              }}
                            >
                              Open
                            </button>
                          </div>
                        </article>
                      );
                      })}
                      {!visibleOverviewStudents.length ? (
                        <EmptyState title="No students" body="Try another search keyword." />
                      ) : null}
                      {canLoadMoreOverview ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setDashboardVisibleCount((value) => value + 6)}
                        >
                          Load more
                        </button>
                      ) : null}
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          ) : null}

          {currentPage === "students" ? (
            <SectionCard
              eyebrow="Students"
              title="Student management"
              body="Select a student to view their profile, documents, and bills. Use Edit to change profile details, Delete to remove the record, and Bills tab to update invoice snapshots."
              action={
                <button type="button" className="button button-secondary" onClick={handleStartNewStudent}>
                  Add new student
                </button>
              }
            >
              <div className="student-management-grid">
                <div className="student-list-panel">
                  <div className="toolbar-row toolbar-row-wrap">
                    <input
                      className="search-input"
                      type="search"
                      placeholder="Search by name, room number, phone, student ID, college ID"
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                    />
                    <select value={studentDocFilter} onChange={(event) => setStudentDocFilter(event.target.value)}>
                      {studentDocFilters.map((filter) => (
                        <option key={filter.id} value={filter.id}>
                          Doc status: {filter.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="stack-list">
                    {filteredStudents.map((student) => {
                      const thumbUrl = student.profilePhotoUrl ? toMediaUrl(student.profilePhotoUrl) : "";
                    const thumbImg = thumbUrl && (isImageFile(thumbUrl) || isLikelyImageUrl(thumbUrl));
                      return (
                        <button
                          key={student.studentId}
                          type="button"
                          className={`student-list-row ${selectedStudentId === student.studentId ? "active" : ""}`}
                          onClick={() => handleSelectStudent(student.studentId)}
                        >
                          <div className="student-list-row-inner">
                            <div
                              className={`student-list-thumb${thumbImg ? " student-list-thumb--photo" : ""}`}
                              aria-hidden
                            >
                              {thumbImg ? <img src={thumbUrl} alt="" /> : <span>{studentInitials(student.name)}</span>}
                            </div>
                            <div className="student-list-row-body">
                              <div className="student-list-row-top">
                                <div>
                                  <strong>{student.name}</strong>
                                  <span>
                                    {student.studentId}{" "}
                                    {student.collegeName || student.collegeId
                                      ? `| ${student.collegeName || student.collegeId}`
                                      : ""}
                                  </span>
                                </div>
                                <StatusPill status={student.documentStatus}>{student.documentStatus}</StatusPill>
                              </div>
                              <span className="student-list-row-meta">
                                Room {student.roomNumber} / {student.bedLabel} - {student.phone}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {!filteredStudents.length ? (
                      <EmptyState title="No student found" body="Try another search keyword or filter." />
                    ) : null}
                  </div>
                </div>

                <div className="student-detail-panel">
                  {!selectedStudent && studentViewMode !== "edit" ? (
                    <EmptyState
                      title="Select a student"
                      body="Choose a student from the list to view their full profile and billing details."
                    />
                  ) : (
                    <div className="student-detail-shell">
                      <div className="student-detail-header">
                        <div className="student-detail-header-brand">
                          {(() => {
                            const headerName = selectedStudent?.name || studentForm.name || "New student";
                            const savedPhoto = selectedStudent?.profilePhotoUrl
                              ? toMediaUrl(selectedStudent.profilePhotoUrl)
                              : "";
                  const showImg = Boolean(savedPhoto && (isImageFile(savedPhoto) || isLikelyImageUrl(savedPhoto)));
                            const imgSrc = savedPhoto;
                            return (
                              <div
                                className={`admin-student-avatar${showImg ? " admin-student-avatar--photo" : ""}`}
                                aria-hidden={showImg ? undefined : true}
                              >
                                {showImg ? (
                                  <img src={imgSrc} alt="" />
                                ) : (
                                  <span className="admin-student-avatar-initials">{studentInitials(headerName)}</span>
                                )}
                              </div>
                            );
                          })()}
                          <div>
                            <h3>{selectedStudent?.name || "New student"}</h3>
                            {selectedStudent ? (
                              <p className="plain-empty">
                                {selectedStudent.studentId}{" "}
                                {selectedStudent.collegeName || selectedStudent.collegeId
                                  ? `| ${selectedStudent.collegeName || selectedStudent.collegeId}`
                                  : ""}
                              </p>
                            ) : (
                              <p className="plain-empty">Create a new student profile</p>
                            )}
                          </div>
                        </div>

                        <div className="detail-actions">
                          {studentViewMode === "read" ? (
                            <button
                              type="button"
                              className="button button-primary"
                              onClick={() => setStudentViewMode("edit")}
                              disabled={!selectedStudent}
                            >
                              Edit
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={handleCancelStudentEdit}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                form="student-edit-form"
                                className="button button-primary"
                                disabled={isSaving}
                              >
                                {isSaving ? "Please wait…" : "Save"}
                              </button>
                            </>
                          )}

                          {selectedStudent && studentViewMode === "read" ? (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => handleDeleteStudent(selectedStudent.studentId)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="toolbar-row toolbar-row-wrap student-detail-tabs">
                        {[
                          { id: "profile", label: "Profile" },
                          { id: "documents", label: "Documents" },
                          { id: "bills", label: "Bills" },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            className={`segmented-tab ${studentDetailTab === tab.id ? "active" : ""}`}
                            onClick={() => setStudentDetailTab(tab.id)}
                            disabled={studentViewMode === "edit"}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {studentDetailTab === "profile" ? (
                        studentViewMode === "read" && selectedStudent ? (
                          <div className="detail-read-grid">
                            {studentFormFields.map((field) => (
                              <div key={field.key} className={field.full ? "detail-span-2" : ""}>
                                <span className="detail-label">{field.label}</span>
                                <strong className="detail-value">
                                  {field.type === "number"
                                    ? formatCurrency(Number(selectedStudent[field.key] || 0))
                                    : String(selectedStudent[field.key] || "-")}
                                </strong>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <form id="student-edit-form" className="form-grid admin-student-form" onSubmit={handleStudentSubmit}>
                            {studentFormFields.map((field, fieldIndex) => {
                              const prev = studentFormFields[fieldIndex - 1];
                              const showSection = !prev || prev.section !== field.section;
                              const sectionMeta = studentFormSectionCopy[field.section];
                              return (
                                <Fragment key={field.key}>
                                  {showSection && sectionMeta ? (
                                    <div className="field-span-2 admin-student-form-section-head">
                                      <p className="admin-student-form-section-kicker">{sectionMeta.kicker}</p>
                                      <h4 className="admin-student-form-section-title">{sectionMeta.title}</h4>
                                      <p className="admin-student-form-section-desc">{sectionMeta.description}</p>
                                    </div>
                                  ) : null}
                                  <label className={field.full ? "field-span-2" : ""}>
                                    {field.label}
                                    {field.key === "roomNumber" ? (
                                      <select
                                        value={studentForm.roomNumber}
                                        onChange={(event) => {
                                          const nextRoom = event.target.value;
                                          setStudentForm((current) => ({
                                            ...current,
                                            roomNumber: nextRoom,
                                            bedLabel: "",
                                          }));
                                        }}
                                      >
                                        <option value="">Select room</option>
                                        {roomOptionsForForm.map((roomNumber) => (
                                          <option key={roomNumber} value={roomNumber}>
                                            Room {roomNumber}
                                          </option>
                                        ))}
                                      </select>
                                    ) : field.key === "bedLabel" ? (
                                      <select
                                        value={studentForm.bedLabel}
                                        onChange={(event) =>
                                          setStudentForm((current) => ({
                                            ...current,
                                            bedLabel: event.target.value,
                                          }))
                                        }
                                        disabled={!studentForm.roomNumber}
                                      >
                                        <option value="">Select bed</option>
                                        {bedOptionsForForm.map((label) => (
                                          <option key={label} value={label}>
                                            Bed {label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : field.type === "tel" ? (
                                      <input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]{10}"
                                        maxLength={10}
                                        value={studentForm[field.key]}
                                        onChange={(event) => {
                                          const next = event.target.value.replace(/\D/g, "").slice(0, 10);
                                          setStudentForm((current) => ({
                                            ...current,
                                            [field.key]: next,
                                          }));
                                        }}
                                      />
                                    ) : (
                                      <input
                                        type={field.type}
                                        value={studentForm[field.key]}
                                        onChange={(event) =>
                                          setStudentForm((current) => ({
                                            ...current,
                                            [field.key]: event.target.value,
                                          }))
                                        }
                                      />
                                    )}
                                  </label>
                                </Fragment>
                              );
                            })}
                          </form>
                        )
                      ) : null}

                      {studentDetailTab === "documents" ? (
                        selectedStudent ? (
                          <div className="stack-list">
                            {selectedStudent.documents.map((document) => {
                              const fileUrl = toMediaUrl(document.fileData);
                              const fileName = document.fileName || `${document.label}.file`;
                              const canPreviewImage = document.fileData && isImageFile(fileName || fileUrl);

                              return (
                                <article key={document.documentId} className="issue-card">
                                  <div className="issue-card-top">
                                    <div>
                                      <h3>{document.label}</h3>
                                      <p>{fileName}</p>
                                    </div>
                                    <StatusPill status={document.status}>{document.status}</StatusPill>
                                  </div>

                                  {document.reviewNote ? (
                                    <p className="issue-note">Note: {document.reviewNote}</p>
                                  ) : null}

                                  {document.fileData ? (
                                    <div className="media-block">
                                      {canPreviewImage ? (
                                        <button
                                          type="button"
                                          className="media-preview-button"
                                          onClick={() => openPreview(fileUrl, fileName)}
                                        >
                                          <img src={fileUrl} alt={document.label} />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="button button-secondary"
                                          onClick={() => openPreview(fileUrl, fileName)}
                                        >
                                          Open document
                                        </button>
                                      )}
                                      <div className="media-actions">
                                        <button
                                          type="button"
                                          className="button button-secondary"
                                          onClick={() => openPreview(fileUrl, fileName)}
                                        >
                                          View
                                        </button>
                                        <a className="button button-secondary" href={fileUrl} download={fileName}>
                                          Download
                                        </a>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="plain-empty">No file available.</p>
                                  )}
                                </article>
                              );
                            })}
                            {!selectedStudent.documents.length ? (
                              <EmptyState title="No documents uploaded" body="Student has not uploaded any documents." />
                            ) : null}
                          </div>
                        ) : (
                          <EmptyState title="No student selected" body="Select a student to view documents." />
                        )
                      ) : null}

                      {studentDetailTab === "bills" ? (
                        selectedStudent ? (
                          <div className="stack-list">
                            {(() => {
                              const payments = data.payments
                                .filter((payment) => payment.studentId === selectedStudent.studentId)
                                .sort((left, right) => new Date(right.dueDate) - new Date(left.dueDate));

                              if (!payments.length) {
                                return (
                                  <EmptyState title="No invoices" body="No payment invoices exist yet for this student." />
                                );
                              }

                              const currentBill =
                                payments.find((payment) => paymentHasBalanceDue(payment)) || payments[0] || null;

                              return (
                                <>
                                  {currentBill ? (
                                    <article className="issue-card">
                                      <div className="issue-card-top">
                                        <div>
                                          <h3>Current bill snapshot</h3>
                                          <p>
                                            {currentBill.monthLabel} - Due {formatDate(currentBill.dueDate)}
                                          </p>
                                        </div>
                                        <div className="issue-badges">
                                          <StatusPill status={paymentInvoiceStatusKey(currentBill)}>
                                            {paymentInvoiceStatusLabel(currentBill)}
                                          </StatusPill>
                                          <StatusPill status={currentBill.proofStatus}>
                                            {proofStatusDisplayLabel(currentBill.proofStatus)}
                                          </StatusPill>
                                        </div>
                                      </div>
                                      <div className="dues-pay-grid" style={{ marginBottom: "0.65rem" }}>
                                        <div className="dues-pay-row">
                                          <span>Total due</span>
                                          <strong>{formatCurrency(currentBill.totalAmount)}</strong>
                                        </div>
                                        <div className="dues-pay-row">
                                          <span>Verified paid</span>
                                          <strong>{formatCurrency(verifiedPaidCredit(currentBill))}</strong>
                                        </div>
                                        {pendingSubmittedAmount(currentBill) > 0 ? (
                                          <div className="dues-pay-row">
                                            <span>Submitted (pending)</span>
                                            <strong>{formatCurrency(pendingSubmittedAmount(currentBill))}</strong>
                                          </div>
                                        ) : null}
                                        <div className="dues-pay-row">
                                          <span>Remaining</span>
                                          <strong>{formatCurrency(paymentOutstandingAmount(currentBill))}</strong>
                                        </div>
                                      </div>
                                      {Number(currentBill.lateFee || 0) > 0 ? (
                                        <p className="plain-empty">Late fee {formatCurrency(currentBill.lateFee)}</p>
                                      ) : null}
                                      {Number(currentBill.fineAmount || 0) ? (
                                        <p>
                                          Fine {formatCurrency(currentBill.fineAmount)}{" "}
                                          {currentBill.fineReason ? `(${currentBill.fineReason})` : ""}
                                        </p>
                                      ) : null}
                                      <div className="action-chip-row">
                                        <button type="button" className="action-chip" onClick={() => handleBillEdit(currentBill)}>
                                          Update current bill
                                        </button>
                                      </div>
                                    </article>
                                  ) : null}

                                  {payments.map((payment) => (
                                    <article key={payment.invoiceId} className="mini-card">
                                      <div className="mini-card-top">
                                        <h3>{payment.monthLabel}</h3>
                                        <div className="issue-badges">
                                          <StatusPill status={paymentInvoiceStatusKey(payment)}>
                                            {paymentInvoiceStatusLabel(payment)}
                                          </StatusPill>
                                          <StatusPill status={payment.proofStatus}>
                                            {proofStatusDisplayLabel(payment.proofStatus)}
                                          </StatusPill>
                                        </div>
                                      </div>
                                      <div className="dues-pay-grid" style={{ marginBottom: "0.5rem" }}>
                                        <div className="dues-pay-row">
                                          <span>Total due</span>
                                          <strong>{formatCurrency(payment.totalAmount)}</strong>
                                        </div>
                                        <div className="dues-pay-row">
                                          <span>Verified paid</span>
                                          <strong>{formatCurrency(verifiedPaidCredit(payment))}</strong>
                                        </div>
                                        {pendingSubmittedAmount(payment) > 0 ? (
                                          <div className="dues-pay-row">
                                            <span>Submitted (pending)</span>
                                            <strong>{formatCurrency(pendingSubmittedAmount(payment))}</strong>
                                          </div>
                                        ) : null}
                                        <div className="dues-pay-row">
                                          <span>Remaining</span>
                                          <strong>{formatCurrency(paymentOutstandingAmount(payment))}</strong>
                                        </div>
                                      </div>
                                      <p>Due: {formatDate(payment.dueDate)}</p>
                                      {Number(payment.lateFee || 0) > 0 ? (
                                        <p className="plain-empty">Late fee {formatCurrency(payment.lateFee)}</p>
                                      ) : null}
                                      {Number(payment.fineAmount || 0) ? (
                                        <p>
                                          Fine {formatCurrency(payment.fineAmount)}{" "}
                                          {payment.fineReason ? `(${payment.fineReason})` : ""}
                                        </p>
                                      ) : null}
                                      <div className="action-chip-row">
                                        <button type="button" className="action-chip" onClick={() => handleBillEdit(payment)}>
                                          Edit bill
                                        </button>
                                      </div>
                                    </article>
                                  ))}
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <EmptyState title="No student selected" body="Select a student to manage bills." />
                        )
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          ) : null}

          {currentPage === "billing" ? (
            <div className="billing-page">
              <header className="billing-hero">
                <div className="billing-hero-text">
                  <p className="eyebrow">Billing workspace</p>
                  <h2 className="billing-hero-title">Monthly charges and adjustments</h2>
                  <p className="billing-hero-lead">
                    Pick the billing month, create missing invoices for new students, then edit electricity, late fees,
                    and fines per resident. Layout adapts to your screen—cards on phones, multi-column on larger
                    displays.
                  </p>
                </div>
                <div className="billing-hero-stats" role="group" aria-label="Month summary">
                  <div className="billing-stat">
                    <span className="billing-stat-label">Invoices (filtered)</span>
                    <strong className="billing-stat-value">{billingMonthStats.count}</strong>
                  </div>
                  <div className="billing-stat">
                    <span className="billing-stat-label">Total on screen</span>
                    <strong className="billing-stat-value">{formatCurrency(billingMonthStats.total)}</strong>
                  </div>
                  <div className="billing-stat billing-stat--muted">
                    <span className="billing-stat-label">Today (device)</span>
                    <strong className="billing-stat-value billing-stat-value--sm">{billingCalendarMonth}</strong>
                  </div>
                </div>
              </header>

              <section className="billing-panel" aria-label="Filters and actions">
                <div className="billing-panel-grid">
                  <label className="billing-control">
                    <span className="billing-control-label">Billing month</span>
                    <input
                      type="month"
                      className="billing-input billing-input--lg"
                      value={billingMonthKey}
                      onChange={(event) => setBillingMonthKey(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                  <label className="billing-control">
                    <span className="billing-control-label">Room</span>
                    <select
                      className="billing-input billing-input--lg"
                      value={billingRoom}
                      onChange={(event) => setBillingRoom(event.target.value)}
                      disabled={isSaving}
                    >
                      <option value="">All rooms</option>
                      {data.rooms.map((room) => (
                        <option key={room.roomNumber} value={room.roomNumber}>
                          {room.roomNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="billing-control billing-control--checkbox">
                    <input
                      type="checkbox"
                      checked={billingAutoCalc}
                      onChange={(event) => setBillingAutoCalc(event.target.checked)}
                      disabled={isSaving}
                    />
                    <span>Auto-calc electricity from units × room rate</span>
                  </label>
                </div>

                <div className="billing-actions">
                  <button
                    type="button"
                    className="button button-secondary billing-actions-primary"
                    disabled={isSaving}
                    onClick={() => onGenerateBillingInvoices?.(billingMonthKey)}
                  >
                    {isSaving ? "Please wait…" : `Generate invoices · ${billingMonthKey}`}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={isSaving}
                    onClick={() => handleConfirmDeleteFutureInvoices("all")}
                  >
                    Remove mistaken future months
                  </button>
                  <button
                    type="button"
                    className="button button-secondary billing-actions-danger"
                    disabled={isSaving || !canDeleteSelectedBillingMonth}
                    title={
                      canDeleteSelectedBillingMonth
                        ? `Delete all invoice rows for ${billingMonthKey} only`
                        : "Only available when the selected month is after this calendar month"
                    }
                    onClick={() => handleConfirmDeleteFutureInvoices("selected")}
                  >
                    Remove {billingMonthKey} only
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={isSaving}
                    onClick={async () => {
                      const updates = [];
                      for (const { payment } of billingInvoices.filtered) {
                        const draft = billingDrafts[payment.invoiceId];
                        if (!draft) continue;
                        const next = {
                          invoiceId: payment.invoiceId,
                          electricityUnits: Number(draft.electricityUnits || 0),
                          electricityAmount: Number(draft.electricityAmount || 0),
                          lateFee: Number(draft.lateFee || 0),
                          fineAmount: Number(draft.fineAmount || 0),
                          fineReason: String(draft.fineReason || ""),
                        };
                        const changed =
                          Number(payment.electricityUnits || 0) !== next.electricityUnits ||
                          Number(payment.electricityAmount || 0) !== next.electricityAmount ||
                          Number(payment.lateFee || 0) !== next.lateFee ||
                          Number(payment.fineAmount || 0) !== next.fineAmount ||
                          String(payment.fineReason || "") !== next.fineReason;
                        if (changed) updates.push(next);
                      }
                      if (!updates.length) return;
                      await onUpdatePaymentBillsBulk(updates);
                    }}
                  >
                    {isSaving ? "Saving…" : "Save all changes"}
                  </button>
                </div>
                <p className="billing-hint">
                  <strong>Current month</strong> is filled in automatically when you add a new student (and whenever
                  the dashboard reloads). Use <strong>Generate</strong> for other months or to backfill if needed.{" "}
                  <strong>Remove future months</strong> only deletes months after today on the server—confirm with
                  DELETE.
                </p>
              </section>

              {!billingInvoices.filtered.length ? (
                <div className="billing-empty">
                  <h3>No invoices for this view</h3>
                  <p>Change month or room, or generate invoices for {billingMonthKey}.</p>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={isSaving}
                    onClick={() => onGenerateBillingInvoices?.(billingMonthKey)}
                  >
                    Generate invoices for {billingMonthKey}
                  </button>
                </div>
              ) : (
                <div className="billing-card-grid">
                  {billingInvoices.filtered.map(({ payment, student }) => (
                    <article key={payment.invoiceId} className="billing-card">
                      <div className="billing-card-head">
                        <div>
                          <h3 className="billing-card-name">{payment.studentName}</h3>
                          <p className="billing-card-meta">
                            Room {student?.roomNumber || "—"} · Bed {student?.bedLabel || "—"}
                          </p>
                          <p className="billing-card-id">{payment.invoiceId}</p>
                        </div>
                        <div className="billing-card-total">
                          <span className="billing-card-total-label">{payment.monthLabel}</span>
                          <strong>{formatCurrency(Number(payment.totalAmount || 0))}</strong>
                        </div>
                      </div>
                      <div className="billing-card-fields">{renderBillingInvoiceEditor(payment, student)}</div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {currentPage === "payments" ? (
            <div className="admin-payments-page">
              <header className="admin-payments-header">
                <p className="admin-payments-eyebrow">Payments</p>
                <h2 className="admin-payments-title">Proof verification</h2>
                <p className="admin-payments-lead">
                  Review uploads by student, approve or reject proofs, and open the bill editor when amounts need
                  correction.
                </p>
              </header>

              <div className="admin-payments-filters billing-panel">
                <div className="admin-payments-tabs-scroll">
                  <div className="segmented-tabs admin-payments-tabs">
                    {paymentTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`segmented-tab ${paymentTab === tab.id ? "active" : ""}`}
                        onClick={() => setPaymentTab(tab.id)}
                        disabled={isSaving}
                      >
                        {tab.label} ({paymentTabCounts[tab.id] || 0})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-payments-controls">
                  <label className="admin-payments-control">
                    <span className="admin-payments-control-label">Month</span>
                    <input
                      type="month"
                      className="admin-payments-input table-input"
                      value={paymentHistoryMonth}
                      onChange={(event) => setPaymentHistoryMonth(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                  <label className="admin-payments-control admin-payments-control--grow">
                    <span className="admin-payments-control-label">Search</span>
                    <input
                      className="admin-payments-input search-input"
                      type="search"
                      placeholder="Name, room, phone, reference…"
                      value={paymentSearch}
                      onChange={(event) => setPaymentSearch(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                </div>
                <p className="payment-history-filter-hint admin-payments-hint">
                  Defaults to this month. Clear the month field to list proofs from every billing period.
                </p>
              </div>

              <div className="stack-list admin-payments-groups">
                {paymentGroups.map((group) => (
                  <details
                    key={group.student?.studentId || group.payments[0]?.invoiceId || "payment-group"}
                    className="admin-payment-group"
                  >
                    <summary className="admin-payment-group-summary">
                      <div className="admin-payment-group-identity">
                        <h3 className="admin-payment-group-name">{group.student?.name || "Unknown student"}</h3>
                        <p className="admin-payment-group-meta">
                          Room {group.student?.roomNumber || "—"} · {group.student?.phone || "—"}
                        </p>
                      </div>
                      {(() => {
                        const s = summarizePaymentGroupForAdmin(group.payments);
                        const hasSettlement =
                          s.pendingVerification > 0 || s.partialPaid > 0 || s.fullyPaid > 0;
                        return (
                          <div className="admin-payment-group-statuses">
                            {s.pendingVerification > 0 ? (
                              <StatusPill status="pending-verification">
                                Pending verification ({s.pendingVerification})
                              </StatusPill>
                            ) : null}
                            {s.partialPaid > 0 ? (
                              <StatusPill status="partial">Partial paid ({s.partialPaid})</StatusPill>
                            ) : null}
                            {s.fullyPaid > 0 ? (
                              <StatusPill status="paid">Fully paid ({s.fullyPaid})</StatusPill>
                            ) : null}
                            {s.proofRejected > 0 ? (
                              <StatusPill status="rejected">Proof rejected ({s.proofRejected})</StatusPill>
                            ) : null}
                            {!hasSettlement && !s.proofRejected && group.payments.length > 0 ? (
                              <span className="plain-empty">
                                {group.payments.length} invoice{group.payments.length !== 1 ? "s" : ""}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </summary>
                    <div className="admin-payment-group-body">
                      {group.payments.flatMap((payment) =>
                        paymentHistoryCardRows(payment).map(({ key, variant, archivedAt, displayPayment }) => {
                          const hasProof = Boolean(displayPayment.paymentScreenshot);
                          const proofUrl = hasProof ? toMediaUrl(displayPayment.paymentScreenshot) : "";
                          const proofName =
                            displayPayment.paymentScreenshotName ||
                            `${payment.studentName}-${payment.monthLabel}-proof`;
                          const isCurrent = variant === "current";

                          return (
                            <article key={key} className="admin-payment-row issue-card">
                              <div className="issue-card-top admin-payment-row-top">
                                <div>
                                  <h3 className="admin-payment-row-title">
                                    {payment.monthLabel}
                                    {variant === "archive" ? (
                                      <span className="payment-history-row-tag">
                                        Earlier proof
                                        {archivedAt ? ` · ${formatShortDate(archivedAt)}` : ""}
                                      </span>
                                    ) : null}
                                  </h3>
                                  <p>
                                    Ref {displayPayment.paymentReference || "Not provided"} · Submitted amount{" "}
                                    <strong>{formatCurrency(displayPayment.submittedAmount || 0)}</strong>
                                  </p>
                                </div>
                                <div className="issue-badges issue-badges--stack">
                                  <StatusPill status={paymentInvoiceStatusKey(displayPayment)}>
                                    {paymentInvoiceStatusLabel(displayPayment)}
                                  </StatusPill>
                                  <StatusPill status={displayPayment.proofStatus}>
                                    {proofStatusDisplayLabel(displayPayment.proofStatus)}
                                  </StatusPill>
                                </div>
                              </div>

                              <div className="dues-pay-grid" style={{ marginBottom: "0.65rem" }}>
                                <div className="dues-pay-row">
                                  <span>Total due</span>
                                  <strong>{formatCurrency(displayPayment.totalAmount)}</strong>
                                </div>
                                <div className="dues-pay-row">
                                  <span>Verified paid</span>
                                  <strong>{formatCurrency(verifiedPaidCredit(displayPayment))}</strong>
                                </div>
                                {pendingSubmittedAmount(displayPayment) > 0 ? (
                                  <div className="dues-pay-row">
                                    <span>Submitted (pending)</span>
                                    <strong>{formatCurrency(pendingSubmittedAmount(displayPayment))}</strong>
                                  </div>
                                ) : null}
                                <div className="dues-pay-row">
                                  <span>Remaining</span>
                                  <strong>{formatCurrency(paymentOutstandingAmount(displayPayment))}</strong>
                                </div>
                              </div>

                              {isCurrent && payment.fineAmount ? (
                                <p className="issue-note">
                                  Fine: {formatCurrency(payment.fineAmount)}{" "}
                                  {payment.fineReason ? `(${payment.fineReason})` : ""}
                                </p>
                              ) : null}

                              {hasProof ? (
                                <div className="media-block">
                                  {isImageFile(proofName || proofUrl) ? (
                                    <button
                                      type="button"
                                      className="media-preview-button"
                                      onClick={() => openPreview(proofUrl, proofName)}
                                    >
                                      <img src={proofUrl} alt={`${payment.studentName} proof`} />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => openPreview(proofUrl, proofName)}
                                    >
                                      Open uploaded proof
                                    </button>
                                  )}
                                  <div className="media-actions">
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => openPreview(proofUrl, proofName)}
                                    >
                                      View
                                    </button>
                                    <a className="button button-secondary" href={proofUrl} download={proofName}>
                                      Download
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <p className="plain-empty">No proof image uploaded.</p>
                              )}

                              {isCurrent && payment.previousPaymentScreenshot ? (
                                <div className="action-chip-row">
                                  <button
                                    type="button"
                                    className="action-chip"
                                    onClick={() =>
                                      openPreview(
                                        toMediaUrl(payment.previousPaymentScreenshot),
                                        payment.previousPaymentScreenshotName || "previous-proof",
                                      )
                                    }
                                  >
                                    Previous upload (replaced)
                                  </button>
                                </div>
                              ) : null}

                              {isCurrent ? (
                                <div className="action-chip-row">
                                  {paymentTab === "pending-verification" ? (
                                    <>
                                      <button
                                        type="button"
                                        className="action-chip"
                                        onClick={() => handlePaymentReview(payment.invoiceId, "verified")}
                                        disabled={isSaving}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        className="action-chip"
                                        onClick={() => handlePaymentReview(payment.invoiceId, "rejected")}
                                        disabled={isSaving}
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="action-chip"
                                    onClick={() => handleBillEdit(payment)}
                                    disabled={isSaving}
                                  >
                                    Edit bill
                                  </button>
                                  {hasProof ? (
                                    <button
                                      type="button"
                                      className="action-chip"
                                      onClick={() => handleDeletePaymentProof(payment.invoiceId)}
                                      disabled={isSaving}
                                    >
                                      Delete proof
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="issue-note" style={{ marginTop: "0.5rem" }}>
                                  Archived proof — actions apply to the latest submission below.
                                </p>
                              )}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </details>
                ))}
                {!paymentGroups.length ? (
                  <EmptyState title="No proofs in this tab" body="Try another tab or search keyword." />
                ) : null}
              </div>
            </div>
          ) : null}

          {currentPage === "documents" ? (
            <div className="admin-documents-page">
              <header className="admin-documents-header">
                <p className="admin-documents-eyebrow">Documents</p>
                <h2 className="admin-documents-title">Verification desk</h2>
                <p className="admin-documents-lead">
                  Approve or reject uploads grouped by student. Use search to narrow the queue.
                </p>
              </header>

              <div className="admin-documents-filters billing-panel">
                <div className="admin-documents-tabs-scroll">
                  <div className="segmented-tabs admin-documents-tabs">
                    {documentTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`segmented-tab ${documentTab === tab.id ? "active" : ""}`}
                        onClick={() => setDocumentTab(tab.id)}
                        disabled={isSaving}
                      >
                        {tab.label} ({documentTabCounts[tab.id] || 0})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-documents-controls">
                  <label className="admin-documents-control">
                    <span className="admin-documents-control-label">Search</span>
                    <input
                      className="admin-documents-input search-input"
                      type="search"
                      placeholder="Student, room, phone, college, file…"
                      value={documentSearch}
                      onChange={(event) => setDocumentSearch(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                </div>
              </div>

              <div className="stack-list admin-documents-groups">
                {documentGroups.map((group) => (
                  <details
                    key={group.student?.studentId || group.documents[0]?.documentId || "document-group"}
                    className="admin-document-group"
                  >
                    <summary className="admin-document-group-summary">
                      <div className="admin-document-group-identity">
                        <h3>{group.student?.name || "Unknown student"}</h3>
                        <p>
                          Room {group.student?.roomNumber || "—"} · {group.student?.phone || "—"}
                        </p>
                      </div>
                      <StatusPill status={group.student?.documentStatus || documentTab}>
                        {group.documents.length} doc{group.documents.length > 1 ? "s" : ""}
                      </StatusPill>
                    </summary>
                    <div className="admin-document-group-body">
                      {group.documents.map((document) => {
                        const fileUrl = toMediaUrl(document.fileData);
                        const fileName = document.fileName || `${document.label}.file`;
                        const canPreviewImage = document.fileData && isImageFile(fileName || fileUrl);

                        return (
                          <article key={document.documentId} className="admin-document-row issue-card">
                            <div className="issue-card-top">
                              <div>
                                <h3>{document.label}</h3>
                                <p>{fileName}</p>
                              </div>
                              <StatusPill status={document.status}>{document.status}</StatusPill>
                            </div>

                            {document.reviewNote ? <p className="issue-note">Note: {document.reviewNote}</p> : null}

                            {document.fileData ? (
                              <div className="media-block">
                                {canPreviewImage ? (
                                  <button
                                    type="button"
                                    className="media-preview-button"
                                    onClick={() => openPreview(fileUrl, fileName)}
                                  >
                                    <img src={fileUrl} alt={document.label} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="button button-secondary"
                                    onClick={() => openPreview(fileUrl, fileName)}
                                  >
                                    Open document
                                  </button>
                                )}
                                <div className="media-actions">
                                  <button
                                    type="button"
                                    className="button button-secondary"
                                    onClick={() => openPreview(fileUrl, fileName)}
                                  >
                                    View
                                  </button>
                                  <a className="button button-secondary" href={fileUrl} download={fileName}>
                                    Download
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <p className="plain-empty">No file available.</p>
                            )}

                            <div className="action-chip-row">
                              {documentTab === "pending" ? (
                                <>
                                  <button
                                    type="button"
                                    className="action-chip"
                                    onClick={() =>
                                      handleDocumentReview(document.studentId, document.documentId, "approved")
                                    }
                                    disabled={isSaving}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="action-chip"
                                    onClick={() =>
                                      handleDocumentReview(document.studentId, document.documentId, "rejected")
                                    }
                                    disabled={isSaving}
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                className="action-chip"
                                onClick={() => handleDeleteDocument(document.studentId, document.documentId)}
                                disabled={isSaving}
                              >
                                Delete document
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                ))}
                {!documentGroups.length ? (
                  <EmptyState title="No documents in this tab" body="Try another tab or search keyword." />
                ) : null}
              </div>
            </div>
          ) : null}

          {currentPage === "complaints" ? (
            <div className="admin-complaints-page">
              <header className="admin-complaints-header">
                <p className="admin-complaints-eyebrow">Complaints</p>
                <h2 className="admin-complaints-title">Hostel complaint desk</h2>
                <p className="admin-complaints-lead">
                  Triage by status, filter by month and category, then update notes and resolution from each card.
                </p>
              </header>

              <div className="admin-complaints-filters billing-panel">
                <div className="admin-complaints-tabs-scroll">
                  <div className="segmented-tabs admin-complaints-tabs">
                    {complaintTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`segmented-tab ${complaintTab === tab.id ? "active" : ""}`}
                        onClick={() => setComplaintTab(tab.id)}
                      >
                        {tab.label} ({complaintTabCounts[tab.id] || 0})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-complaints-controls">
                  <label className="admin-complaints-control">
                    <span className="admin-complaints-control-label">Month</span>
                    <input
                      type="month"
                      className="admin-complaints-input table-input"
                      value={complaintHistoryMonth}
                      onChange={(event) => setComplaintHistoryMonth(event.target.value)}
                    />
                  </label>
                  <label className="admin-complaints-control">
                    <span className="admin-complaints-control-label">Category</span>
                    <select
                      className="admin-complaints-select"
                      value={complaintCategory}
                      onChange={(event) => setComplaintCategory(event.target.value)}
                    >
                      <option value="all">All categories</option>
                      {complaintCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-complaints-control">
                    <span className="admin-complaints-control-label">Search</span>
                    <input
                      className="admin-complaints-input search-input"
                      type="search"
                      placeholder="Student, room, category, title…"
                      value={complaintSearch}
                      onChange={(event) => setComplaintSearch(event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="complaint-list admin-complaints-list">
                {filteredComplaints.map((complaint) => (
                  <article key={complaint.complaintId} className="admin-complaint-card issue-card">
                    <div className="issue-card-top">
                      <div>
                        <h3>{complaint.title}</h3>
                        <p>
                          {complaint.studentName} - Room {complaint.roomNumber}
                        </p>
                      </div>
                      <div className="issue-badges">
                        <StatusPill status={complaint.targetType}>{complaint.targetType}</StatusPill>
                        <StatusPill status={complaint.category}>{complaint.category}</StatusPill>
                        <StatusPill status={complaint.status}>{complaint.status}</StatusPill>
                      </div>
                    </div>
                    <p className="issue-body">{complaint.description}</p>
                    {complaint.againstStudentName ? (
                      <p className="issue-note">Against student: {complaint.againstStudentName}</p>
                    ) : null}
                    <textarea
                      rows="3"
                      value={complaintNotes[complaint.complaintId] ?? complaint.adminNote ?? ""}
                      onChange={(event) =>
                        setComplaintNotes((current) => ({
                          ...current,
                          [complaint.complaintId]: event.target.value,
                        }))
                      }
                      placeholder="Write admin note"
                    />
                    <div className="action-chip-row">
                      {complaintTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`action-chip ${complaint.status === tab.id ? "active" : ""}`}
                          onClick={() => handleComplaintUpdate(complaint.complaintId, tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="action-chip"
                        onClick={() => handleDeleteComplaint(complaint.complaintId)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
                {!filteredComplaints.length ? (
                  <EmptyState title="No complaints here" body="Try another tab, category, or search term." />
                ) : null}
              </div>
            </div>
          ) : null}

          {currentPage === "leaves" ? (
            <div className="admin-leaves-page">
              <header className="admin-leaves-header">
                <p className="admin-leaves-eyebrow">Leaves</p>
                <h2 className="admin-leaves-title">Leave requests</h2>
                <p className="admin-leaves-lead">
                  Review dates and reasons by status, filter by the month the request was submitted, then move items
                  through pending, approved, or rejected with an optional admin note.
                </p>
              </header>

              <div className="admin-leaves-filters billing-panel">
                <div className="admin-leaves-tabs-scroll">
                  <div className="segmented-tabs admin-leaves-tabs">
                    {leaveTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`segmented-tab ${leaveTab === tab.id ? "active" : ""}`}
                        onClick={() => setLeaveTab(tab.id)}
                        disabled={isSaving}
                      >
                        {tab.label} ({leaveTabCounts[tab.id] || 0})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-leaves-controls">
                  <label className="admin-leaves-control">
                    <span className="admin-leaves-control-label">Submitted month</span>
                    <input
                      type="month"
                      className="admin-leaves-input table-input"
                      value={leaveHistoryMonth}
                      onChange={(event) => setLeaveHistoryMonth(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                  <label className="admin-leaves-control admin-leaves-control--grow">
                    <span className="admin-leaves-control-label">Search</span>
                    <input
                      className="admin-leaves-input search-input"
                      type="search"
                      placeholder="Student, room, reason…"
                      value={leaveSearch}
                      onChange={(event) => setLeaveSearch(event.target.value)}
                      disabled={isSaving}
                    />
                  </label>
                </div>
                <p className="admin-leaves-hint payment-history-filter-hint">
                  Defaults to this month. Clear the month field to list requests submitted in any period.
                </p>
              </div>

              <div className="stack-list admin-leaves-list">
                {filteredLeaves.map((leaveRequest) => (
                  <article key={leaveRequest.leaveId} className="admin-leave-card issue-card">
                    <div className="issue-card-top">
                      <div>
                        <h3>{leaveRequest.studentName}</h3>
                        <p>
                          Room {leaveRequest.roomNumber}
                          {leaveRequest.studentId ? (
                            <>
                              {" "}
                              · ID <span className="admin-leave-meta-id">{leaveRequest.studentId}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="issue-badges">
                        <StatusPill status={leaveRequest.status}>{leaveRequest.status}</StatusPill>
                      </div>
                    </div>
                    <p className="admin-leave-card__dates">
                      <span className="admin-leave-card__dates-label">Away</span>{" "}
                      {formatDate(leaveRequest.fromDate)} – {formatDate(leaveRequest.toDate)}
                    </p>
                    <p className="issue-body admin-leave-card__reason">{leaveRequest.reason}</p>
                    <textarea
                      rows="3"
                      value={leaveNotes[leaveRequest.leaveId] ?? leaveRequest.adminNote ?? ""}
                      onChange={(event) =>
                        setLeaveNotes((current) => ({
                          ...current,
                          [leaveRequest.leaveId]: event.target.value,
                        }))
                      }
                      placeholder="Write admin note"
                      disabled={isSaving}
                    />
                    <div className="action-chip-row">
                      {leaveTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`action-chip ${leaveRequest.status === tab.id ? "active" : ""}`}
                          onClick={() => handleLeaveUpdate(leaveRequest.leaveId, tab.id)}
                          disabled={isSaving}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                {!filteredLeaves.length ? (
                  <EmptyState
                    title="No leave requests here"
                    body="Try another status tab, month, or search term."
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {currentPage === "notices" ? (
            <div className="notices-page">
              <header className="notices-page-header">
                <div>
                  <h2 className="notices-page-title">Notices</h2>
                  <p className="notices-page-lead">
                    Students see these on their dashboard. Pinned posts stay at the top. Search filters the list below—
                    nothing is deleted until you choose Delete.
                  </p>
                </div>
              </header>

              <div className="notices-layout">
                <section className="notices-feed" aria-label="Published notices">
                  <div className="notices-feed-head">
                    <h3 className="notices-feed-heading">Published</h3>
                    <div className="notices-feed-tools">
                      <label className="notices-search-field">
                        <span className="notices-search-label">Search</span>
                        <input
                          className="notices-search-input"
                          type="search"
                          placeholder="Title or message…"
                          value={noticeSearch}
                          onChange={(event) => setNoticeSearch(event.target.value)}
                          disabled={isSaving}
                        />
                      </label>
                      <span className="notices-feed-count" aria-live="polite">
                        {filteredNotices.length} {filteredNotices.length === 1 ? "notice" : "notices"}
                      </span>
                    </div>
                  </div>

                  <div className="notices-list">
                    {filteredNotices.map((notice) => (
                      <article
                        key={notice.noticeId}
                        className={`notices-item ${notice.pinned ? "notices-item--pinned" : ""}`}
                      >
                        <div className="notices-item-top">
                          <h4 className="notices-item-title">{notice.title}</h4>
                          <div className="notices-item-badges">
                            {notice.pinned ? (
                              <span className="notices-pill notices-pill--pin">Pinned</span>
                            ) : null}
                          </div>
                        </div>
                        <p className="notices-item-body">{notice.body}</p>
                        <div className="notices-item-footer">
                          <time className="notices-item-date" dateTime={notice.publishedAt}>
                            {formatDate(notice.publishedAt)}
                          </time>
                          <button
                            type="button"
                            className="button button-secondary notices-item-delete"
                            disabled={isSaving}
                            onClick={() => handleDeleteNotice(notice.noticeId)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                    {!filteredNotices.length ? (
                      <div className="notices-empty">
                        <p className="notices-empty-title">No notices match</p>
                        <p className="notices-empty-body">Try another search, or write a new notice in the panel on the right.</p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <aside className="notices-compose" aria-label="Compose new notice">
                  <h3 className="notices-compose-heading">New notice</h3>
                  <p className="notices-compose-hint">Use a short title and a clear message. Turn on Pin if it should stay at the top.</p>
                  <form className="notices-compose-form" onSubmit={handleNoticeSubmit}>
                    <label className="notices-field">
                      <span className="notices-field-label">Title</span>
                      <input
                        className="notices-field-input"
                        type="text"
                        value={noticeForm.title}
                        onChange={(event) =>
                          setNoticeForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        disabled={isSaving}
                        placeholder="e.g. Water shutdown Sunday"
                      />
                    </label>
                    <label className="notices-field">
                      <span className="notices-field-label">Message</span>
                      <textarea
                        className="notices-field-input notices-field-textarea"
                        rows={6}
                        value={noticeForm.body}
                        onChange={(event) =>
                          setNoticeForm((current) => ({
                            ...current,
                            body: event.target.value,
                          }))
                        }
                        disabled={isSaving}
                        placeholder="What should residents know?"
                      />
                    </label>
                    <label className="notices-pin-row">
                      <input
                        type="checkbox"
                        checked={noticeForm.pinned}
                        onChange={(event) =>
                          setNoticeForm((current) => ({
                            ...current,
                            pinned: event.target.checked,
                          }))
                        }
                        disabled={isSaving}
                      />
                      <span>Pin to top of the board</span>
                    </label>
                    <button type="submit" className="button button-primary notices-compose-submit" disabled={isSaving}>
                      {isSaving ? "Publishing…" : "Publish notice"}
                    </button>
                  </form>
                </aside>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <MobileNavDrawer
        open={mobileMenuOpen}
        title="Admin menu"
        onClose={() => setMobileMenuOpen(false)}
        links={adminPages.map((page) => ({
          to: `/admin/${page.id}`,
          label: page.label,
          badge: formatBadgeCount(adminNavBadgeCount(page.id)),
        }))}
      />

      <Modal
        open={modalState.open}
        title={modalState.title}
        actions={
          <>
            <button type="button" className="button button-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className={`button ${modalState.danger ? "button-secondary" : "button-primary"}`}
              onClick={confirmModal}
              disabled={isSaving}
            >
              {isSaving ? "Please wait…" : modalState.confirmLabel}
            </button>
          </>
        }
      >
        {modalState.mode === "addRooms" ? (
          <div className="form-stack">
            <label>
              Floor label <span className="plain-empty">(optional)</span>
              <input
                type="text"
                placeholder="e.g. Ground floor"
                value={modalState.addRoomFloor}
                onChange={(event) =>
                  setModalState((current) => ({ ...current, addRoomFloor: event.target.value }))
                }
              />
            </label>
            <label>
              Electricity meter ID <span className="plain-empty">(optional)</span>
              <input
                type="text"
                placeholder='e.g. MET-{room} or leave blank for MET-101, MET-102…'
                value={modalState.addRoomMeter}
                onChange={(event) =>
                  setModalState((current) => ({ ...current, addRoomMeter: event.target.value }))
                }
              />
            </label>
            <p className="plain-empty">
              Leave floor and meter blank if you don’t need them yet. Use <code>{"{room}"}</code> in meter ID to insert
              each room number.
            </p>
            {modalState.noteLabel ? (
              <label>
                {modalState.noteLabel}
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={modalState.note}
                  onChange={(event) =>
                    setModalState((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
          </div>
        ) : (
          <div className="form-stack">
            {modalState.description ? <p className="plain-empty">{modalState.description}</p> : null}
            {modalState.noteLabel ? (
              <label>
                {modalState.noteLabel}
                <textarea
                  rows="4"
                  value={modalState.note}
                  onChange={(event) =>
                    setModalState((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
              </label>
            ) : modalState.description ? null : (
              <p>Please confirm this action.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={previewState.open}
        title={previewState.fileName || "Preview"}
        actions={
          <>
            <a className="button button-secondary" href={previewState.url} download={previewState.fileName}>
              Download
            </a>
            <button type="button" className="button button-primary" onClick={closePreview}>
              Close
            </button>
          </>
        }
      >
        {previewState.isImage ? (
          <img className="modal-preview-image" src={previewState.url} alt={previewState.fileName} />
        ) : (
          <a className="button button-secondary" href={previewState.url} target="_blank" rel="noreferrer">
            Open file in new tab
          </a>
        )}
      </Modal>

      <Modal
        open={roomToolsOpen}
        title="Room tools"
        actions={
          <button type="button" className="button button-primary" onClick={() => setRoomToolsOpen(false)}>
            Close
          </button>
        }
      >
        <div className="stack-list">
          <article className="issue-card">
            <div className="issue-card-top">
              <div>
                <h3>Electricity rate (all rooms)</h3>
                <p>One rate is applied to every room for billing auto-calc.</p>
              </div>
            </div>
            <div className="toolbar-row toolbar-row-wrap">
              <label className="toolbar-field">
                Rate per unit
                <input
                  type="number"
                  min="0"
                  className="table-input"
                  value={globalElectricityRate}
                  onChange={(event) => setGlobalElectricityRate(event.target.value)}
                  disabled={isSaving}
                />
              </label>
              <button
                type="button"
                className="button button-primary"
                disabled={isSaving || !data.rooms.length}
                onClick={async () => {
                  const rate = Number(globalElectricityRate || 0);
                  await onSetGlobalElectricityRate?.(rate);
                }}
              >
                Save rate
              </button>
            </div>
            {!data.rooms.length ? <p className="plain-empty">Add rooms first to set a rate.</p> : null}
          </article>
          <button
            type="button"
            className="button button-secondary"
            disabled={isSaving}
            onClick={() => {
              setRoomToolsOpen(false);
              handleAddRooms();
            }}
          >
            Add room
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={isSaving}
            onClick={() => {
              setRoomToolsOpen(false);
              handleAutoAssignRooms();
            }}
          >
            Auto-assign students (A/B)
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={isSaving || !data.rooms.length}
            onClick={() => {
              setRoomToolsOpen(false);
              handleDeleteAllRooms();
            }}
          >
            Delete all rooms…
          </button>
        </div>
      </Modal>

      {/* Student quick view removed for focused edit UX */}
    </div>
  );
}
