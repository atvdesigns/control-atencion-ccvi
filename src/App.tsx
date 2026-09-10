import {
  AccountBalance,
  AddBusiness,
  AssignmentTurnedIn,
  Badge,
  BusinessCenter,
  Campaign,
  CheckCircle,
  Dashboard,
  Description,
  DirectionsCar,
  DisplaySettings,
  DeleteOutline,
  Edit,
  ExpandMore,
  FileDownload,
  Gavel,
  HowToReg,
  Monitor,
  Payments,
  Person,
  PictureAsPdf,
  PlayArrow,
  QrCode2,
  Refresh,
  Storefront,
  WarningAmber,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Grid2,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PublicJourneyStepper } from "./components/PublicJourneyStepper";
import { PublicJourneyInformation } from "./components/PublicJourneyInformation";
import {
  getPublicJourneyPresentation,
  getPublicJourneyStep,
  isVisiblePublicCode,
} from "./publicJourney";
import type { AppData, CaseRecord, CenterConfig, Metrics, PriorityType, PublicDisplayCallEvent, PublicDisplayEntry, PublicTurnStatus, Role, ServiceType, SessionMetadata } from "./types";
import { ccviBackgroundGradient, ccviPalette } from "./theme";
import {
  calculateMetrics,
  callNextForCashierRealtime,
  callNextForOperatorRealtime,
  completePaymentRealtime,
  createCenter,
  deleteCenter,
  formatServiceHours,
  formatDuration,
  getAccessiblePublicCode,
  formatPublicTicketLabel,
  getAccessiblePublicTicketLabel,
  getCurrentCenter,
  getCurrentSession,
  isCenterOpenForTickets,
  getPublicStatusUrl,
  loadData,
  markWindowNoShowRealtime,
  markCaseAsPriorityRealtime,
  createPriorityArrivalRealtime,
  removeCasePriorityRealtime,
  markNoShowRealtime,
  pausePaymentRealtime,
  reassignCaseRealtime,
  resumePausedPaymentRealtime,
  roleLabels,
  saveData,
  updateCasePriorityRealtime,
  selectCenter,
  serviceLabels,
  startCashierAttentionRealtime,
  startValidationRealtime,
  stateLabels,
  finishDocumentValidationRealtime,
  updateCenter,
  windowForRole,
} from "./store";
import {
  createKioskArrivalCallable,
  hasFirebaseConfig,
  getCenterConfigRealtime,
  removeCenterConfigRealtime,
  observeAuthSession,
  signInWithUsername,
  signOutCurrentUser,
  subscribeToOperationalDay,
  subscribeToPublicDisplay,
  subscribeToPublicDisplayCalls,
  subscribeToPublicKioskConfig,
  subscribeToPublicTurnStatus,
  writeCenterConfigRealtime,
  writePublicKioskConfigRealtime,
  type AuthSessionState,
  type OperationalDaySnapshot,
  type PublicKioskConfig,
} from "./services/firebase";

const roleOptions: Role[] = [
  "kiosk",
  "operator-window-1",
  "operator-window-2",
  "cashier1",
  "cashier2",
  "cashier3",
  "cashier4",
  "cashier5",
  "admin",
  "display",
];

const statusColors: Record<string, string> = {
  waiting_document_validation: ccviPalette.orange,
  called_to_window: ccviPalette.orange,
  in_document_validation: ccviPalette.petroleum,
  documentation_incomplete: ccviPalette.warning,
  rejected: ccviPalette.error,
  waiting_cashier: "#1B75BB",
  called_to_cashier: ccviPalette.navy,
  in_cashier_attention: ccviPalette.petroleum,
  completed: ccviPalette.success,
  no_show: ccviPalette.warning,
};

const traceEventLabels: Record<string, string> = {
  arrival_created: "Turno creado en tótem",
  called_to_window: "Turno llamado a ventanilla",
  validation_started: "Revisión documental iniciada",
  window_no_show: "Persona no se presentó en ventanilla",
  documentation_incomplete: "Documentación marcada como incompleta",
  case_rejected: "Trámite rechazado",
  folder_code_generated: "Código de carpeta generado",
  added_to_cashier_queue: "Turno enviado a cola de caja",
  called_to_cashier: "Turno llamado a caja",
  cashier_attention_started: "Atención en caja iniciada",
  payment_completed: "Pago registrado y trámite finalizado",
  payment_not_completed: "Pago no realizado",
  payment_resumed: "Atención de caja retomada",
  no_show: "Persona no se presentó en caja",
  case_reassigned: "Turno reasignado de ventanilla",
  priority_created: "Atención preferencial creada",
  priority_updated: "Motivo de atención preferencial actualizado",
  priority_removed: "Atención preferencial quitada",
};

const priorityTypeLabels: Record<PriorityType, string> = {
  older_adult: "Persona mayor",
  pregnant: "Persona embarazada",
  wheelchair_user: "Persona usuaria de silla de ruedas",
  disability: "Persona con discapacidad",
  reduced_mobility: "Persona con movilidad reducida",
  other: "Otro caso que requiere prioridad",
};

const priorityTypeOptions: Array<{ value: PriorityType; label: string }> = [
  { value: "older_adult", label: "Persona mayor." },
  { value: "pregnant", label: "Persona embarazada." },
  { value: "wheelchair_user", label: "Persona usuaria de silla de ruedas." },
  { value: "disability", label: "Persona con discapacidad." },
  { value: "reduced_mobility", label: "Persona con movilidad reducida." },
  { value: "other", label: "Otro caso que requiera prioridad." },
];

const traceActorLabels: Record<string, string> = {
  kiosk: "Tótem",
  "operator-window-1": "Ventanilla 1",
  "operator-window-2": "Ventanilla 2",
  cashier1: "Caja 1",
  cashier2: "Caja 2",
  cashier3: "Caja 3",
  cashier4: "Caja 4",
  cashier5: "Caja 5",
  admin: "Administrador",
};

const formatTraceAction = (action: string) => traceEventLabels[action] ?? "Actividad registrada";

const formatTraceActor = (actorRole: string) => traceActorLabels[actorRole] ?? "Sistema";

const formatTime = (value: number | null | undefined) =>
  value ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(value) : "--";

const metricsRows = (metrics: Metrics) => [
  ["Llegadas", metrics.totalArrivals],
  ["Representación", metrics.representationArrivals],
  ["Propietarios", metrics.vehicleOwnerArrivals],
  ["Aprobados", metrics.approved],
  ["Incompletos", metrics.incomplete],
  ["Rechazados", metrics.rejected],
  ["Espera caja", metrics.waitingCashier],
  ["En caja", metrics.inCashierAttention],
  ["Finalizados", metrics.completed],
  ["Promedio validación", formatDuration(metrics.averageValidationMs)],
  ["Promedio espera caja", formatDuration(metrics.averageCashierWaitMs)],
  ["Promedio atención caja", formatDuration(metrics.averageCashierHandlingMs)],
  ["Promedio ciclo total", formatDuration(metrics.averageEndToEndMs)],
];

const safeFileName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const escapeCsv = (value: string | number) => {
  const text = String(value);
  const formulaSafeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;

  return `"${formulaSafeText.replace(/"/g, '""')}"`;
};

const escapeHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const institutionalReportHtml = (center: CenterConfig, session: SessionMetadata, metrics: Metrics) => {
  const rows = metricsRows(metrics)
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Métricas ${escapeHtml(center.name)} ${escapeHtml(session.date)}</title>
        <style>
          @page { margin: 18mm; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            margin: 0;
            background: #ffffff;
          }
          .report {
            max-width: 980px;
            margin: 0 auto;
            padding: 32px;
          }
          .header {
            display: flex;
            align-items: center;
            gap: 18px;
            padding: 18px 20px;
            border-radius: 18px;
            background: #111B32;
            color: #ffffff;
          }
          .logo {
            width: 72px;
            height: 72px;
            object-fit: contain;
            border-radius: 14px;
            background: #ffffff;
            padding: 6px;
          }
          h1 {
            margin: 0;
            font-size: 28px;
            line-height: 1.15;
          }
          .subtitle {
            margin: 6px 0 0;
            color: rgba(255,255,255,0.78);
          }
          .meta {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 22px 0;
          }
          .meta-card {
            border: 1px solid #DDE2EA;
            border-radius: 14px;
            padding: 14px 16px;
            background: #F5F6F8;
          }
          .label {
            color: #5F6673;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .value {
            margin-top: 4px;
            font-size: 17px;
            font-weight: 800;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            overflow: hidden;
            border-radius: 16px;
            border: 1px solid #DDE2EA;
          }
          th, td {
            border-bottom: 1px solid #DDE2EA;
            padding: 14px 16px;
            text-align: left;
            font-size: 15px;
          }
          th {
            background: #F5F6F8;
            color: #111B32;
            width: 58%;
          }
          tr:nth-child(even) td,
          tr:nth-child(even) th {
            background: #FAFBFC;
          }
          .accent {
            height: 8px;
            background: #FF6B00;
            border-radius: 999px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 24px;
            color: #5F6673;
            font-size: 12px;
          }
          @media print {
            .report { padding: 0; }
          }
        </style>
      </head>
      <body>
        <main class="report">
          <section class="header">
            <img class="logo" src="${window.location.origin}/ccvi-logo.png" alt="Logo CCVI" />
            <div>
              <h1>Métricas de atención CCVI</h1>
              <p class="subtitle">Reporte institucional de jornada operativa</p>
            </div>
          </section>
          <div class="accent"></div>
          <section class="meta">
            <div class="meta-card">
              <div class="label">Centro</div>
              <div class="value">${escapeHtml(center.name)}</div>
            </div>
            <div class="meta-card">
              <div class="label">Día de atención</div>
              <div class="value">${escapeHtml(session.date)}</div>
            </div>
            <div class="meta-card">
              <div class="label">Horario configurado</div>
              <div class="value">${escapeHtml(formatServiceHours(center))}</div>
            </div>
          </section>
          <table>
            <tbody>${rows}</tbody>
          </table>
          <p class="footer">Documento generado desde Control de Atención CCVI. No contiene datos personales de usuarios.</p>
        </main>
      </body>
    </html>
  `;
};

const downloadMetricsCsv = (center: CenterConfig, session: SessionMetadata, metrics: Metrics) => {
  const rows = [
    ["Control de Atención CCVI"],
    ["Reporte de métricas de jornada"],
    ["Centro", center.name],
    ["Día de atención", session.date],
    ["Horario configurado", formatServiceHours(center)],
    [],
    ["Indicador", "Valor"],
    ...metricsRows(metrics),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `metricas-${safeFileName(center.shortCode)}-${session.date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadRejectedUsersCsv = (
  rejectedUsers: CaseRecord[],
  rejectedAtFormatter: Intl.DateTimeFormat,
) => {
  const rows: Array<Array<string | number>> = [
    ["Fecha", "Número de atención", "Ventanilla", "Nombre y apellido", "Teléfono"],
    ...rejectedUsers.map((caseItem) => [
      rejectedAtFormatter.format(caseItem.documentValidationCompletedAt as number),
      caseItem.publicCode,
      `Ventanilla ${caseItem.assignedWindowNumber}`,
      caseItem.rejectedCustomerName?.trim() || "Sin registrar",
      caseItem.rejectedCustomerPhone?.trim() || "Sin registrar",
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date();
  const dateLabel = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  link.href = url;
  link.download = `ccvi-usuarios-rechazados-${dateLabel}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const printMetricsPdf = (center: CenterConfig, session: SessionMetadata, metrics: Metrics) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("No pudimos abrir la vista de PDF. Revise si el navegador bloqueó la ventana emergente.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(institutionalReportHtml(center, session, metrics));
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 350);
};

const getRoleFromUrl = (): Role => {
  if (window.location.pathname === "/totem") return "kiosk";
  if (window.location.pathname === "/monitor") return "display";
  const raw = new URLSearchParams(window.location.search).get("role");
  const stored = window.localStorage.getItem("ccvi-role") as Role | null;
  return raw === "display" || raw === "kiosk"
    ? raw
    : stored === "display" || stored === "kiosk"
      ? stored
      : "kiosk";
};

const Header = ({
  role,
  data,
  setRole,
  setData,
  allowedCenterIds,
  onLogout,
}: {
  role: Role;
  data: AppData;
  setRole: (role: Role) => void;
  setData: (updater: (data: AppData) => AppData) => void;
  allowedCenterIds?: string[];
  onLogout?: () => void;
}) => {
  const center = getCurrentCenter(data);
  const centerOptions = Object.values(data.centers).filter(
    (centerOption) => !allowedCenterIds || allowedCenterIds.includes(centerOption.centerId),
  );

  if (role === "display") {
    return (
      <AppBar position="relative" color="primary" elevation={0}>
        <Toolbar
          sx={{
            minHeight: { xs: 80, md: 92 },
            px: { xs: 2, sm: 3, md: 5 },
            maxWidth: 1536,
            mx: "auto",
            width: "100%",
            gap: 2,
          }}
        >
          <AppLogo size={56} />
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="h6" sx={{ color: "white", lineHeight: 1.2 }}>
              Centro de Custodia de Vehículos Infractores
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.72)" }}>
              CCVI · {center.name}
            </Typography>
          </Box>
          <Typography
            variant="subtitle1"
            sx={{ color: "rgba(255,255,255,0.82)", display: { xs: "none", sm: "block" } }}
          >
            Monitor de atención
          </Typography>
        </Toolbar>
      </AppBar>
    );
  }

  return (
    <AppBar
      position="sticky"
      color="primary"
      elevation={0}
      sx={{ borderBottom: "1px solid rgba(255,255,255,0.14)" }}
    >
      <Toolbar
        sx={{
          gap: { xs: 1.5, md: 2 },
          py: 1.5,
          px: { xs: 2, md: 4 },
          maxWidth: 1680,
          mx: "auto",
          width: "100%",
          flexWrap: { xs: "wrap", lg: "nowrap" },
        }}
      >
        <AppLogo size={56} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
            {role === "kiosk" ? center.name : "Control de Atención CCVI"}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.82 }}>
            {role === "kiosk"
              ? "CCVI · Centro de atención"
              : `${center.name} · Gestión paperless y cola de caja en tiempo real`}
          </Typography>
        </Box>
        {role === "kiosk" && (
          <Typography
            variant="h6"
            sx={{ display: { xs: "none", xl: "block" }, opacity: 0.82, whiteSpace: "nowrap" }}
          >
            Tótem de autoatención
          </Typography>
        )}
        {!onLogout && <HeaderSelect label="Rol" minWidth={220}>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            displayEmpty
            inputProps={{ "aria-label": "Seleccionar rol de la aplicación" }}
          >
            {roleOptions.filter((option) => option === "kiosk" || option === "display").map((option) => (
              <MenuItem key={option} value={option}>
                {roleLabels[option]}
              </MenuItem>
            ))}
          </Select>
        </HeaderSelect>}
        <HeaderSelect label="Centro" minWidth={280}>
          <Select
            value={data.selectedCenterId}
            onChange={(event) => setData((current) => selectCenter(current, event.target.value))}
            displayEmpty
            inputProps={{ "aria-label": "Seleccionar centro de atención" }}
          >
            {centerOptions.map((centerOption) => (
              <MenuItem key={centerOption.centerId} value={centerOption.centerId}>
                {centerOption.name}
              </MenuItem>
            ))}
          </Select>
        </HeaderSelect>
        <Chip label={hasFirebaseConfig ? "Firebase listo" : "Demo local"} color="secondary" />
        {onLogout && <Button color="inherit" onClick={onLogout}>Cerrar sesión</Button>}
      </Toolbar>
    </AppBar>
  );
};

const HeaderSelect = ({
  label,
  minWidth,
  children,
}: {
  label: string;
  minWidth: number;
  children: React.ReactNode;
}) => (
  <Stack spacing={0.5} sx={{ minWidth: { xs: "100%", sm: minWidth }, flexShrink: 0 }}>
    <Typography
      component="label"
      variant="caption"
      sx={{ color: "rgba(255,255,255,0.82)", fontWeight: 750, lineHeight: 1 }}
    >
      {label}
    </Typography>
    <FormControl size="small" sx={{ bgcolor: "white", borderRadius: controlRadius }}>
      {children}
    </FormControl>
  </Stack>
);

const CountChip = ({ count, label }: { count: number; label: string }) => (
  <Chip
    label={count}
    size="small"
    aria-label={`${count} ${label}`}
    sx={{ minWidth: 32 }}
  />
);

const CountBadge = ({ count, label }: { count: number; label: string }) => (
  <Box
    aria-label={`${count} ${label}`}
    sx={{
      minWidth: 34,
      height: 34,
      px: 1.25,
      borderRadius: "999px",
      bgcolor: "action.selected",
      color: "text.primary",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "0.9rem",
      fontWeight: 800,
      fontVariantNumeric: "tabular-nums",
    }}
  >
    {count}
  </Box>
);

const surfaceRadius = "28px";
const controlRadius = "16px";
const surfaceShadow = "0 12px 28px rgba(17, 27, 50, 0.08)";

const sectionContainerSx = {
  border: `1px solid ${ccviPalette.border}`,
  borderRadius: surfaceRadius,
  bgcolor: "background.paper",
  boxShadow: surfaceShadow,
  overflow: "hidden",
};

const sectionHeaderSx = {
  px: { xs: 2, md: 2.5 },
  py: 2,
  borderBottom: `1px solid ${ccviPalette.border}`,
};

const sectionBodySx = {
  p: { xs: 2, md: 2.5 },
};

const accordionSectionSx = {
  ...sectionContainerSx,
  "&.MuiPaper-root": {
    borderRadius: surfaceRadius,
  },
  "&:before": {
    display: "none",
  },
  "&.Mui-expanded": {
    m: 0,
    borderRadius: surfaceRadius,
  },
};

const accordionSummarySx = {
  px: { xs: 2, md: 2.5 },
  py: 2,
  minHeight: "auto",
  bgcolor: "#FFFFFF",
  "&.Mui-expanded": {
    minHeight: "auto",
    borderBottom: `1px solid ${ccviPalette.border}`,
    bgcolor: "#FFFFFF",
  },
  "& .MuiAccordionSummary-content": {
    my: 0,
  },
  "& .MuiAccordionSummary-content.Mui-expanded": {
    my: 0,
  },
};

const accordionDetailsSx = {
  p: { xs: 2, md: 2.5 },
};

const groupedCardsSurfaceSx = {
  ...accordionDetailsSx,
  bgcolor: "#ecf0f7",
  boxShadow:
    "inset 0 18px 28px rgba(17, 27, 50, 0.08), inset 0 -12px 22px rgba(17, 27, 50, 0.04)",
};

const scrollableAccordionDetailsSx = {
  ...groupedCardsSurfaceSx,
  maxHeight: { xs: "52vh", md: 520 },
  overflowY: "auto",
  overscrollBehavior: "contain",
  pr: { xs: 1.25, md: 1.75 },
  scrollbarGutter: "stable",
  "&::-webkit-scrollbar": {
    width: 10,
  },
  "&::-webkit-scrollbar-track": {
    bgcolor: "rgba(17, 27, 50, 0.06)",
    borderRadius: 999,
  },
  "&::-webkit-scrollbar-thumb": {
    bgcolor: "rgba(17, 27, 50, 0.24)",
    borderRadius: 999,
    border: "2px solid rgba(255,255,255,0.8)",
  },
  "&::-webkit-scrollbar-thumb:hover": {
    bgcolor: "rgba(17, 27, 50, 0.36)",
  },
};

const operationalCardSx = {
  border: `1px solid ${ccviPalette.border}`,
  borderRadius: surfaceRadius,
  boxShadow: surfaceShadow,
  overflow: "hidden",
};

const SectionHeader = ({
  icon,
  title,
  count,
  countLabel,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  countLabel: string;
}) => (
  <Stack direction="row" alignItems="center" spacing={1.25}>
    <Box sx={{ color: ccviPalette.orange, display: "grid", placeItems: "center", flexShrink: 0 }}>
      {icon}
    </Box>
    <Typography variant="h5">{title}</Typography>
    <CountChip count={count} label={countLabel} />
  </Stack>
);

const publicCodeWindowNumber = (publicCode: string) => {
  const match = /^V(\d+)-/.exec(publicCode);
  return match ? Number(match[1]) : 0;
};

const displayAccentFor = (entry: PublicDisplayCallEvent) => {
  if (entry.destinationType === "cashier") return "#2F6FED";
  return publicCodeWindowNumber(entry.publicCode) === 1 ? ccviPalette.orange : ccviPalette.navy;
};

const monitorDestinationLabel = (destination: string) =>
  destination.replace(/^Ventanilla\b/i, "Ventana");

const playDisplayCallSound = () => {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, audioContext.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.32);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.34);
    window.setTimeout(() => void audioContext.close(), 500);
  } catch {
    // Browsers may block audio until the monitor has received a user interaction.
  }
};

const AppLogo = ({ size = 56 }: { size?: number }) => (
  <Box
    sx={{
      width: size,
      height: size,
      borderRadius: controlRadius,
      bgcolor: "white",
      display: "grid",
      placeItems: "center",
      p: 0.5,
      flexShrink: 0,
      boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
    }}
  >
    <Box
      component="img"
      src="/ccvi-logo.png"
      alt="Logo CCVI"
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  </Box>
);

const MetricCard = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "orange" | "navy" | "success" | "warning";
}) => {
  const color =
    tone === "orange"
      ? ccviPalette.orange
      : tone === "navy"
        ? ccviPalette.navy
        : tone === "success"
          ? ccviPalette.success
          : tone === "warning"
            ? ccviPalette.warning
            : ccviPalette.text;

  return (
    <Box
      sx={{
        height: "100%",
        border: `1px solid ${ccviPalette.border}`,
        borderRadius: surfaceRadius,
        bgcolor: "background.paper",
        p: { xs: 2, md: 2.5 },
      }}
    >
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" sx={{ color, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </Typography>
    </Box>
  );
};

const CaseCard = ({
  caseItem,
  center: _center,
  children,
  prominent = false,
  compact = false,
  processed = false,
  showPriorityLabel = false,
}: {
  caseItem: CaseRecord;
  center: CenterConfig;
  children?: React.ReactNode;
  prominent?: boolean;
  compact?: boolean;
  processed?: boolean;
  showPriorityLabel?: boolean;
}) => {
  const statusColor = statusColors[caseItem.currentState] ?? ccviPalette.warmGray;
  const cashierLabel = caseItem.cashierId?.replace("cashier", "Caja ");
  const codeVariant = prominent || processed ? "h3" : compact ? "h5" : "h4";

  return (
    <Card
      sx={{
        borderLeft: `${prominent ? 12 : 8}px solid ${statusColor}`,
        borderRadius: surfaceRadius,
        height: "100%",
        bgcolor: prominent ? "rgba(255,255,255,0.98)" : "background.paper",
        boxShadow: prominent ? "0 18px 44px rgba(17, 27, 50, 0.14)" : undefined,
        overflow: "hidden",
      }}
    >
      <CardContent sx={compact ? { p: { xs: 2, md: 2 }, "&:last-child": { pb: { xs: 2, md: 2 } } } : undefined}>
        <Stack spacing={compact ? 1.25 : prominent ? 2 : 1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "flex-start" }}
            justifyContent="space-between"
            gap={1.25}
          >
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 750, lineHeight: 1, letterSpacing: "0.02em" }}
              >
                Usuario
              </Typography>
              <Typography
                variant={codeVariant}
                aria-label={
                  showPriorityLabel
                    ? getAccessiblePublicTicketLabel(caseItem.publicCode, caseItem.isPriority)
                    : getAccessiblePublicCode(caseItem.publicCode)
                }
                sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 0.95 }}
              >
                {showPriorityLabel
                  ? formatPublicTicketLabel(caseItem.publicCode, caseItem.isPriority)
                  : caseItem.publicCode}
              </Typography>
            </Stack>
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              justifyContent={{ xs: "flex-start", sm: "flex-end" }}
              sx={{
                flexWrap: "wrap",
                maxWidth: { sm: "68%" },
                "@media (min-width:680px)": {
                  flexWrap: "nowrap",
                },
                "& .MuiChip-root": {
                  flexShrink: 0,
                },
              }}
            >
              <Chip label={stateLabels[caseItem.currentState]} size="small" />
              {cashierLabel && <Chip icon={<Payments />} label={cashierLabel} size="small" />}
              <Chip
                icon={<Badge />}
                label={`Llegada ${formatTime(caseItem.arrivalAt)}`}
                variant="outlined"
                size="small"
              />
            </Stack>
          </Stack>
          {caseItem.folderCode && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip icon={<Description />} label={`Carpeta ${caseItem.folderCode}`} color="primary" size="small" />
            </Stack>
          )}
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <Card sx={{ borderRadius: surfaceRadius, bgcolor: "rgba(255,255,255,0.72)" }}>
    <CardContent>
      <Typography color="text.secondary">{text}</Typography>
    </CardContent>
  </Card>
);

interface KioskIssuedTicket {
  publicCode: string;
  publicToken: string;
  serviceLabel: string;
  assignedWindowNumber: number;
}

const kioskMinutesInTimezone = (timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
};

const isPublicKioskOpen = (center: PublicKioskConfig) => {
  if (!center.enabled) return false;
  const [startHour, startMinute] = center.serviceStartTime.split(":").map(Number);
  const [endHour, endMinute] = center.serviceEndTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const current = kioskMinutesInTimezone(center.timezone);
  if (![start, end, current].every(Number.isFinite) || start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
};

const KioskView = ({ centerId }: { centerId: string }) => {
  const [center, setCenter] = useState<PublicKioskConfig | null>(null);
  const [lastCase, setLastCase] = useState<KioskIssuedTicket | null>(null);
  const [pendingService, setPendingService] = useState<ServiceType | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const creatingTicketRef = useRef(false);
  const centerIsOpen = center ? isPublicKioskOpen(center) : false;
  const pendingWindow = pendingService
    ? center?.windows
        .filter((item) => item.enabled && item.serviceType === pendingService)
        .sort((a, b) => a.displayOrder - b.displayOrder)[0]
    : undefined;

  useEffect(() => {
    setCenter(null);
    try {
      return subscribeToPublicKioskConfig(centerId, setCenter, () => setCenter(null));
    } catch {
      setCenter(null);
      return undefined;
    }
  }, [centerId]);

  const createTicket = async (serviceType: ServiceType) => {
    if (!center) return;
    if (creatingTicketRef.current) return;
    creatingTicketRef.current = true;
    setIsCreatingTicket(true);
    setCreationError(null);

    if (!isPublicKioskOpen(center)) {
      setPendingService(null);
      creatingTicketRef.current = false;
      setIsCreatingTicket(false);
      return;
    }

    try {
      const created = await createKioskArrivalCallable(center.centerId, serviceType);
      const assignedWindow = center.windows
        .filter((item) => item.enabled && item.serviceType === serviceType)
        .sort((a, b) => a.displayOrder - b.displayOrder)[0];
      if (!assignedWindow) return;

      setLastCase({
        ...created,
        serviceLabel: assignedWindow.serviceLabel,
        assignedWindowNumber: assignedWindow.windowNumber,
      });
      setRemainingSeconds(center.kioskTimeoutSeconds);
      setPendingService(null);
    } catch {
      setCreationError("No pudimos generar su número. Revise la conexión e intente nuevamente.");
    } finally {
      creatingTicketRef.current = false;
      setIsCreatingTicket(false);
    }
  };

  useEffect(() => {
    if (!lastCase) return undefined;
    if (remainingSeconds <= 0) {
      setLastCase(null);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => current - 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lastCase, remainingSeconds]);

  if (!center) {
    return <CenteredShell><Typography>Cargando configuración del centro...</Typography></CenteredShell>;
  }

  if (lastCase) {
    const progress = center.kioskTimeoutSeconds
      ? (remainingSeconds / center.kioskTimeoutSeconds) * 100
      : 0;

    return (
      <Box
        sx={{
          minHeight: "calc(100vh - 80px)",
          display: "grid",
          placeItems: "center",
          px: { xs: 2, sm: 3 },
          py: { xs: 3, md: 4 },
          bgcolor: ccviPalette.navy,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.52)), url('/ccvi-login-background.png')",
          backgroundSize: "cover",
          backgroundPosition: { xs: "62% center", md: "center" },
        }}
      >
        <Card
          sx={{
            position: "relative",
            width: "min(640px, 100%)",
            borderRadius: 3,
            overflow: "hidden",
            boxShadow: "0 16px 32px rgba(0,0,0,0.25), 0 4px 8px rgba(0,0,0,0.1)",
          }}
        >
          <Box
            sx={{
              width: "fit-content",
              maxWidth: "calc(100% - 32px)",
              mx: "auto",
              px: 2,
              py: 1,
              bgcolor: ccviPalette.navy,
              color: "common.white",
              borderRadius: "0 0 12px 12px",
              textAlign: "center",
            }}
          >
            <Typography variant="caption" fontWeight={700}>
              {lastCase.serviceLabel}
            </Typography>
          </Box>
          <CardContent sx={{ px: { xs: 2.5, sm: 4 }, pt: 1.5, pb: { xs: 3, sm: 2.5 }, "&:last-child": { pb: { xs: 3, sm: 2.5 } } }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <Box role="status" aria-live="polite" aria-atomic="true">
                <Typography fontWeight={600} color="text.secondary">
                  Su número de atención es
                </Typography>
                <Typography
                  variant="h1"
                  aria-label={getAccessiblePublicCode(lastCase.publicCode)}
                  sx={{
                    mt: 0.5,
                    color: ccviPalette.navy,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: { xs: "4.5rem", sm: "5.5rem" },
                    lineHeight: 1.08,
                  }}
                >
                  {lastCase.publicCode}
                </Typography>
              </Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 2, sm: 2.5 }}
                alignItems="center"
                width="100%"
              >
                <Box
                  sx={{
                    width: 152,
                    height: 152,
                    p: 1.25,
                    borderRadius: 1.5,
                    border: `1px solid ${ccviPalette.border}`,
                    bgcolor: "#F9FAFB",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <QRCodeSVG
                    value={getPublicStatusUrl(lastCase.publicToken)}
                    size={128}
                    title={`Código QR del número de atención ${lastCase.publicCode}`}
                  />
                </Box>
                <Box textAlign={{ xs: "center", sm: "left" }}>
                  <Typography fontWeight={700}>Guarde su número de atención</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.5 }}>
                    Tome una fotografía de esta pantalla o escanee el código QR.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
                    En esta página podrá consultar su número, la ventanilla asignada y, posteriormente, la caja a la
                    que deberá dirigirse.
                  </Typography>
                </Box>
              </Stack>
              <Alert
                severity="info"
                icon={<Storefront sx={{ fontSize: 30 }} />}
                sx={{ width: "100%", textAlign: "left", borderRadius: 1.5, py: 1, alignItems: "center", bgcolor: "#E1F7FE" }}
              >
                <Typography component="p" fontWeight={700}>
                  Pase a Ventanilla {lastCase.assignedWindowNumber}
                </Typography>
                <Typography component="p" variant="body2">
                  Guarde este número. Lo necesitará durante todo el proceso.
                </Typography>
              </Alert>
              <Box sx={{ width: "100%" }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Esta pantalla volverá al inicio en {remainingSeconds} segundos.
                </Typography>
                <LinearProgress variant="determinate" value={progress} sx={{ width: "100%", height: 4, borderRadius: 2 }} />
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center" width="100%">
                <Button
                  variant="outlined"
                  onClick={() => setRemainingSeconds(center.kioskTimeoutSeconds)}
                  sx={{ minHeight: 56, minWidth: { xs: "100%", sm: 220 }, borderWidth: 2 }}
                >
                  Necesito más tiempo
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => setLastCase(null)}
                  sx={{ minHeight: 56, minWidth: { xs: "100%", sm: 132 } }}
                >
                  Finalizar
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const representationWindow = center.windows
    .filter((item) => item.enabled && item.serviceType === "representation")
    .sort((a, b) => a.displayOrder - b.displayOrder)[0];
  const ownerWindow = center.windows
    .filter((item) => item.enabled && item.serviceType === "vehicle_owner")
    .sort((a, b) => a.displayOrder - b.displayOrder)[0];

  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 80px)",
        bgcolor: ccviPalette.navy,
        backgroundImage:
          "linear-gradient(180deg, rgba(8, 20, 36, 0.66) 0%, rgba(8, 20, 36, 0.78) 100%), url('/ccvi-login-background.png')",
        backgroundSize: "cover",
        backgroundPosition: { xs: "62% center", md: "center" },
        px: { xs: 2, sm: 3, md: 6 },
        py: { xs: 3, sm: 4, md: 5 },
      }}
    >
      <Stack spacing={{ xs: 3, md: 4.5 }} textAlign="center" width="100%" maxWidth={1440} mx="auto">
        <Stack spacing={1.25} alignItems="center">
          <Typography
            variant="h3"
            sx={{
              color: "common.white",
              fontSize: { xs: "2.5rem", md: "3rem" },
              lineHeight: 1.2,
              textShadow: "0 2px 18px rgba(0,0,0,0.28)",
            }}
          >
            Bienvenido
          </Typography>
          <Typography
            variant="h4"
            sx={{ color: "common.white", fontSize: { xs: "1.65rem", sm: "2rem", md: "2.25rem" } }}
          >
            Centro de Custodia de Vehículos Infractores
          </Typography>
          <Typography variant="h6" sx={{ color: "rgba(255,255,255,0.88)" }}>
            ¿Qué tipo de atención necesita?
          </Typography>
        </Stack>
        {!centerIsOpen && (
          <Alert severity="warning" sx={{ textAlign: "left" }}>
            La generación de turnos está disponible solo dentro del horario de atención del centro:{" "}
            <strong>{center.serviceStartTime} a {center.serviceEndTime}</strong>. Las métricas de jornadas anteriores se conservan para consulta
            administrativa.
          </Alert>
        )}
        <Grid container spacing={{ xs: 2, md: 4 }} alignItems="stretch">
          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              size="large"
              variant="contained"
              color="secondary"
              disabled={!centerIsOpen}
              onClick={() => setPendingService("representation")}
              sx={{
                minHeight: { xs: 232, sm: 250, md: 280 },
                height: "100%",
                p: { xs: 2.5, md: 4 },
                bgcolor: "#E8751A",
                backgroundImage: "linear-gradient(118deg, #E8751A 0%, #F58220 58%, #FF9B42 100%)",
                borderRadius: "20px",
                whiteSpace: "normal",
                textAlign: "left",
                alignItems: "stretch",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
                "&:hover": {
                  bgcolor: "#E8751A",
                  backgroundImage: "linear-gradient(118deg, #D96812 0%, #EF7615 58%, #F78C31 100%)",
                  boxShadow: "0 12px 36px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(-2px)",
                },
                "&.Mui-focusVisible": { outline: "3px solid #FFFFFF", outlineOffset: 4 },
                "&.Mui-disabled": { color: "rgba(255,255,255,0.78)", opacity: 0.62 },
              }}
            >
              <Stack spacing={3} width="100%" justifyContent="space-between">
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ xs: "flex-start", sm: "center" }}>
                  <Box sx={{ width: 76, height: 76, borderRadius: 1.5, bgcolor: "white", color: "#E8751A", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <BusinessCenter sx={{ fontSize: 42 }} />
                  </Box>
                  <Typography
                    component="span"
                    variant="h4"
                    color="common.white"
                    sx={{ fontSize: { xs: "1.75rem", sm: "2.125rem" }, overflowWrap: "break-word", wordBreak: "normal" }}
                  >
                    Representación, empresa o poder notarial
                  </Typography>
                </Stack>
                <Box sx={{ bgcolor: "white", color: ccviPalette.navy, borderRadius: 1, px: 2, py: 1.75 }}>
                  <Typography component="span">
                    Será atendido en: <strong>Ventanilla {representationWindow?.windowNumber ?? "sin asignar"}</strong>
                  </Typography>
                </Box>
              </Stack>
            </Button>
          </Grid>
          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              size="large"
              variant="contained"
              disabled={!centerIsOpen}
              onClick={() => setPendingService("vehicle_owner")}
              sx={{
                minHeight: { xs: 232, sm: 250, md: 280 },
                height: "100%",
                p: { xs: 2.5, md: 4 },
                bgcolor: ccviPalette.navy,
                backgroundImage: "linear-gradient(118deg, #1B2A4A 0%, #173D8F 62%, #1257F5 100%)",
                borderRadius: "20px",
                whiteSpace: "normal",
                textAlign: "left",
                alignItems: "stretch",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
                "&:hover": {
                  bgcolor: ccviPalette.navy,
                  backgroundImage: "linear-gradient(118deg, #111D36 0%, #12367F 62%, #0D49D4 100%)",
                  boxShadow: "0 12px 36px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(-2px)",
                },
                "&.Mui-focusVisible": { outline: "3px solid #FFFFFF", outlineOffset: 4 },
                "&.Mui-disabled": { color: "rgba(255,255,255,0.78)", opacity: 0.62 },
              }}
            >
              <Stack spacing={3} width="100%" justifyContent="space-between">
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ xs: "flex-start", sm: "center" }}>
                  <Box sx={{ width: 76, height: 76, borderRadius: 1.5, bgcolor: "white", color: ccviPalette.navy, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <DirectionsCar sx={{ fontSize: 46 }} />
                  </Box>
                  <Typography
                    component="span"
                    variant="h4"
                    color="common.white"
                    sx={{ fontSize: { xs: "1.75rem", sm: "2.125rem" }, overflowWrap: "break-word", wordBreak: "normal" }}
                  >
                    Propietario del vehículo retenido
                  </Typography>
                </Stack>
                <Box sx={{ bgcolor: "white", color: ccviPalette.navy, borderRadius: 1, px: 2, py: 1.75 }}>
                  <Typography component="span">
                    Será atendido en: <strong>Ventanilla {ownerWindow?.windowNumber ?? "sin asignar"}</strong>
                  </Typography>
                </Box>
              </Stack>
            </Button>
          </Grid>
        </Grid>
        <Paper
          variant="outlined"
          sx={{
            bgcolor: "rgba(239, 248, 245, 0.94)",
            borderColor: "rgba(255,255,255,0.48)",
            borderRadius: 2,
            p: { xs: 2, md: 2.25 },
            textAlign: "left",
            boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: ccviPalette.success, flexShrink: 0 }}>
              <QrCode2 />
              <Typography fontWeight={700}>Soporte QR</Typography>
            </Stack>
            <Typography>
              Su número se mostrará en pantalla. Puede guardarlo con una fotografía o mediante el código QR.
            </Typography>
          </Stack>
        </Paper>
        <Dialog
          open={Boolean(pendingService)}
          onClose={() => setPendingService(null)}
          fullWidth
          maxWidth="sm"
          aria-labelledby="kiosk-confirmation-title"
          aria-describedby="kiosk-confirmation-description"
          BackdropProps={{
            sx: {
              background:
                "linear-gradient(180deg, rgba(27,42,74,0.7) 0%, rgba(17,24,39,0.86) 100%)",
            },
          }}
          PaperProps={{
            sx: {
              width: "calc(100% - 32px)",
              maxWidth: 640,
              maxHeight: "calc(100% - 32px)",
              m: 2,
              borderRadius: 3,
              boxShadow: "0 16px 32px rgba(0,0,0,0.25), 0 4px 8px rgba(0,0,0,0.1)",
              overflow: "hidden",
            },
          }}
        >
          <DialogTitle sx={{ px: { xs: 2.5, sm: 4 }, pt: { xs: 2.5, sm: 3 }, pb: 1.5 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <AppLogo size={56} />
              <Typography
                id="kiosk-confirmation-description"
                variant="h6"
                component="p"
                fontWeight={700}
                color="primary"
                sx={{ lineHeight: 1.3 }}
              >
                {pendingService ? serviceLabels[pendingService] : ""}
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent sx={{ px: { xs: 2.5, sm: 4 }, pb: 1 }}>
            {pendingService && (
              <Stack spacing={{ xs: 2.5, sm: 3 }}>
                <Typography variant="h5" component="h2" fontWeight={700}>
                  Antes de continuar
                </Typography>
                <Box
                  component="ol"
                  sx={{
                    m: 0,
                    pl: 3,
                    display: "grid",
                    gap: 2.25,
                    "& > li": { pl: 0.5 },
                    "& > li::marker": { color: "text.secondary", fontWeight: 700 },
                  }}
                >
                  <Box component="li">
                    <Typography component="h3" fontWeight={700}>
                      Guarde su número
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
                      Saque su celular y tome una fotografía de la pantalla o escanee el código QR.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                      Necesitará este número durante todo el proceso.
                    </Typography>
                  </Box>
                  <Box component="li">
                    <Typography component="h3" fontWeight={700}>
                      Pase al área de espera
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
                      Su atención corresponde a Ventanilla {pendingWindow?.windowNumber ?? "sin asignar"}.
                    </Typography>
                  </Box>
                  <Box component="li">
                    <Typography component="h3" fontWeight={700}>
                      Espere el llamado
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
                      Mire el monitor y mantenga su documentación preparada.
                    </Typography>
                  </Box>
                </Box>
                {pendingWindow ? (
                  <Alert
                    severity="info"
                    icon={<Storefront sx={{ fontSize: 30 }} />}
                    sx={{ borderRadius: 1.5, py: 1, alignItems: "center", bgcolor: "#E1F7FE" }}
                  >
                    <Typography component="p">
                      Será atendido en <strong>Ventanilla {pendingWindow.windowNumber}</strong>
                    </Typography>
                  </Alert>
                ) : (
                  <Alert severity="warning">
                    No hay una ventanilla disponible para este tipo de atención. Solicite ayuda al personal del centro.
                  </Alert>
                )}
                {creationError && <Alert severity="error">{creationError}</Alert>}
              </Stack>
            )}
          </DialogContent>
          <DialogActions
            sx={{
              px: { xs: 2.5, sm: 4 },
              pt: 2,
              pb: { xs: 2.5, sm: 4 },
              gap: 1.5,
              justifyContent: "center",
              flexDirection: { xs: "column-reverse", sm: "row" },
              "& > :not(style) ~ :not(style)": { ml: 0 },
            }}
          >
            <Button
              variant="outlined"
              onClick={() => setPendingService(null)}
              sx={{ minHeight: 56, minWidth: { xs: "100%", sm: 132 }, borderWidth: 2 }}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              disabled={!centerIsOpen || !pendingWindow || !pendingService || isCreatingTicket}
              onClick={() => pendingService && createTicket(pendingService)}
              sx={{ minHeight: 56, minWidth: { xs: "100%", sm: 250 }, px: 4 }}
            >
              {isCreatingTicket ? "Generando número..." : "Confirmar y obtener número"}
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Box>
  );
};

const CenteredShell = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      minHeight: "calc(100vh - 80px)",
      display: "grid",
      placeItems: "center",
      px: { xs: 2, sm: 3, md: 5 },
      py: { xs: 3, md: 5 },
      background: ccviBackgroundGradient,
      backgroundAttachment: "fixed",
    }}
  >
    {children}
  </Box>
);

const OperatorView = ({
  operatorWindow,
  role,
  data,
  setData,
}: {
  operatorWindow: NonNullable<ReturnType<typeof windowForRole>>;
  role: Role;
  data: AppData;
  setData: (updater: (data: AppData) => AppData) => void;
}) => {
  const [priorityDialogCase, setPriorityDialogCase] = useState<CaseRecord | null>(null);
  const [priorityCreationOpen, setPriorityCreationOpen] = useState(false);
  const [isCreatingPriority, setIsCreatingPriority] = useState(false);
  const [createdPriorityCase, setCreatedPriorityCase] = useState<CaseRecord | null>(null);
  const [priorityRemovalCase, setPriorityRemovalCase] = useState<CaseRecord | null>(null);
  const [selectedPriorityType, setSelectedPriorityType] = useState<PriorityType | "">("");
  const [rejectionDialogCase, setRejectionDialogCase] = useState<CaseRecord | null>(null);
  const [rejectedCustomerName, setRejectedCustomerName] = useState("");
  const [rejectedCustomerPhone, setRejectedCustomerPhone] = useState("");
  const closePriorityDialog = () => {
    setPriorityDialogCase(null);
    setPriorityCreationOpen(false);
    setIsCreatingPriority(false);
    setCreatedPriorityCase(null);
    setSelectedPriorityType("");
  };
  const closeRejectionDialog = () => {
    setRejectionDialogCase(null);
    setRejectedCustomerName("");
    setRejectedCustomerPhone("");
  };
  const center = getCurrentCenter(data);
  const otherWindows = center.windows.filter(
    (windowItem) => windowItem.enabled && windowItem.windowId !== operatorWindow.windowId,
  );
  const queue = Object.values(data.cases)
    .filter(
      (caseItem) =>
        caseItem.centerId === data.selectedCenterId &&
        caseItem.assignedWindowId === operatorWindow.windowId &&
        ["waiting_document_validation", "called_to_window", "in_document_validation"].includes(
          caseItem.currentState,
        ),
    )
    .sort((a, b) => a.arrivalAt - b.arrivalAt);
  const activeCase = queue.find((caseItem) => caseItem.currentState !== "waiting_document_validation");
  const waitingCases = queue.filter((caseItem) => caseItem.currentState === "waiting_document_validation");
  const processed = Object.values(data.cases)
    .filter(
      (caseItem) =>
        caseItem.centerId === data.selectedCenterId &&
        caseItem.assignedWindowId === operatorWindow.windowId &&
        !["waiting_document_validation", "called_to_window", "in_document_validation"].includes(
          caseItem.currentState,
        ),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  return (
    <Page
      title={`${operatorWindow.name} · ${operatorWindow.serviceLabel}`}
      description="Recuerda que debes esperar a que el usuario se presente, validar la documentación presentada, asignar una carpeta física, escribir el número de atención en la carpeta e informar al usuario que será derivado a caja."
    >
      <Stack spacing={{ xs: 3, md: 4 }} useFlexGap>
        <Grid2 container spacing={3} alignItems="stretch">
          <Grid2 size={{ xs: 12, md: 6 }}>
              <Card
                sx={{
                  bgcolor: ccviPalette.navy,
                  color: "white",
                  borderRadius: surfaceRadius,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    px: { xs: 2, sm: 3 },
                    py: 2,
                    borderBottom: "1px solid rgba(255, 255, 255, 0.16)",
                  }}
                >
                  <Typography variant="h5">Próxima atención documental</Typography>
                </Box>
                <CardContent
                  sx={{
                    p: { xs: 2, sm: 3 },
                    "&:last-child": { pb: { xs: 2, sm: 3 } },
                  }}
                >
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<PlayArrow />}
                  onClick={async () => {
                    const next = await callNextForOperatorRealtime(
                      data,
                      operatorWindow.windowId,
                      role,
                    );
                    setData(() => next);
                  }}
                  disabled={Boolean(activeCase) || waitingCases.length === 0}
                        sx={{ width: "100%", flex: 1, minHeight: 48 }}
                      >
                        Siguiente turno
                      </Button>
            <Button
              variant="contained"
              onClick={() => {
                setPriorityDialogCase(null);
                setCreatedPriorityCase(null);
                setSelectedPriorityType("");
                setPriorityCreationOpen(true);
              }}
              sx={{
                          width: "100%",
                          flex: 1,
                          minHeight: 48,
                          bgcolor: "info.main",
                          "&:hover": { bgcolor: "info.dark" },
                        }}
                      >
                  Turno Preferencial
                </Button>
              </Stack>
              {activeCase && (
                <Alert severity="warning">
                  Debe finalizar {activeCase.publicCode} antes de llamar otro cliente.
                </Alert>
              )}
              {!activeCase && waitingCases.length === 0 && (
                <Alert severity="info">
                  No hay usuarios en espera para llamar en esta ventanilla. Cuando se genere un nuevo turno en el tótem, aparecerá en la cola "En espera de atención".
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>

          </Grid2>

          <Grid2 size={{ xs: 12, md: 6 }}>
        <Paper variant="outlined" sx={{ ...sectionContainerSx, p: 0 }}>
          <Box sx={sectionHeaderSx}>
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{ color: ccviPalette.orange, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Campaign />
              </Box>
              <Typography variant="h5">Atención actual</Typography>
              <CountBadge count={activeCase ? 1 : 0} label="usuarios llamados" />
            </Stack>
          </Box>
          <Box sx={sectionBodySx}>
            {!activeCase && (
              <Stack spacing={1.25}>
                <Typography variant="h6" color="primary">
                  Sin usuario llamado
                </Typography>
                <Typography color="text.secondary">
                  Esta sección mostrará el turno que debe presentarse en ventanilla o que está en revisión documental.
                </Typography>
                <Alert severity={waitingCases.length > 0 ? "info" : "warning"}>
                  {waitingCases.length > 0
                    ? "Presione “Llamar siguiente turno” para llamar al primer usuario según el orden de llegada."
                    : "No hay usuarios disponibles para llamar. Cuando se genere un nuevo turno en el tótem, aparecerá en “En espera de atención”."}
                </Alert>
              </Stack>
            )}
            {activeCase && (
              <CaseCard caseItem={activeCase} center={center} prominent showPriorityLabel>
            {activeCase.currentState === "called_to_window" && (
                  <Stack spacing={1.5}>
                    <Alert severity="info">
                      Este turno ya fue llamado. Espere a que la persona se presente para iniciar la revisión.
                    </Alert>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      variant="contained"
                      onClick={async () => {
                        const next = await startValidationRealtime(
                          data,
                          activeCase.caseId,
                          role,
                        );
                        setData(() => next);
                      }}
                    >
                      Iniciar validación
                    </Button>
                    <Button
                      variant="outlined"
                      color="warning"
                      onClick={async () => {
                        const next = await markWindowNoShowRealtime(
                          data,
                          activeCase.caseId,
                          role,
                        );
                        setData(() => next);
                      }}
                    >
                      No se presentó
                    </Button>
                  </Stack>
                  {activeCase.isPriority && activeCase.priorityType ? (
                    <Button
                      variant="text"
                      sx={{ minHeight: 44, ml: { sm: "auto" } }}
                      onClick={() => {
                        setPriorityDialogCase(activeCase);
                        setSelectedPriorityType(activeCase.priorityType ?? "");
                      }}
                    >
                      Gestionar preferencial
                    </Button>
                  ) : null}
                </Stack>
                  </Stack>
                )}
                {activeCase.currentState === "in_document_validation" && (
                  <Stack spacing={1.5}>
                    {activeCase.validationLevel === "enhanced" && (
                      <Alert severity="warning">
                        Verifique la documentación requerida para representación, empresa o poder notarial antes de aprobar.
                      </Alert>
                    )}
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{
                        "& > .MuiButton-root": {
                          minHeight: 44,
                          width: { xs: "100%", sm: "auto" },
                        },
                      }}
                    >
                      <Button
                        variant="contained"
                        color="success"
                        onClick={async () => {
                          const next = await finishDocumentValidationRealtime(
                            data,
                            activeCase.caseId,
                            "approved",
                            role,
                          );
                          setData(() => next);
                        }}
                      >
                        Aprobar
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={async () => {
                          const next = await finishDocumentValidationRealtime(
                            data,
                            activeCase.caseId,
                            "incomplete",
                            role,
                          );
                          setData(() => next);
                        }}
                      >
                        Incompleto
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => setRejectionDialogCase(activeCase)}
                      >
                        Rechazar
                      </Button>
                      {otherWindows.map((windowItem) => (
                        <Button
                          key={windowItem.windowId}
                          variant="outlined"
                          onClick={async () => {
                            const next = await reassignCaseRealtime(
                              data,
                              activeCase.caseId,
                              windowItem.windowId,
                              role,
                            );
                            setData(() => next);
                          }}
                          sx={{
                            color: ccviPalette.text,
                            borderColor: "rgba(17, 27, 50, 0.34)",
                            bgcolor: "rgba(17, 27, 50, 0.02)",
                            "&:hover": {
                              borderColor: ccviPalette.text,
                              bgcolor: "rgba(17, 27, 50, 0.08)",
                              boxShadow: "0 8px 18px rgba(17, 27, 50, 0.10)",
                            },
                            "&:active": {
                              bgcolor: "rgba(17, 27, 50, 0.14)",
                            },
                          }}
                        >
                          Reasignar
                        </Button>
                      ))}
                                {activeCase.isPriority && activeCase.priorityType ? (
              <Button
                variant="text"
                sx={{ minHeight: 44 }}
                onClick={() => {
                  setPriorityDialogCase(activeCase);
                  setSelectedPriorityType(activeCase.priorityType ?? "");
                }}
              >
                Gestionar preferencial
              </Button>
            ) : null}
</Stack>
                    {otherWindows.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Use la reasignación solo si el usuario corresponde a otra ventanilla. El turno conserva su código y hora de llegada.
                      </Typography>
                    )}
                  </Stack>
                )}
              </CaseCard>
            )}
          </Box>
        </Paper>
          </Grid2>
        </Grid2>

        <Accordion defaultExpanded disableGutters sx={accordionSectionSx}>
          <AccordionSummary
            expandIcon={<ExpandMore />}
            aria-label={`En espera de atención, ${waitingCases.length} usuarios`}
            sx={accordionSummarySx}
          >
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{ color: ccviPalette.orange, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <HowToReg />
              </Box>
              <Typography variant="h5">En espera de atención</Typography>
              <CountBadge count={waitingCases.length} label="usuarios en espera" />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={scrollableAccordionDetailsSx}>
            <Grid2 container spacing={3}>
              {waitingCases.length === 0 && (
                <Grid2 size={{ xs: 12 }}>
                  <EmptyState text="No hay usuarios esperando atención en esta ventanilla." />
                </Grid2>
              )}
              {waitingCases.map((caseItem) => (
                <Grid2 size={{ xs: 12 }} key={caseItem.caseId}>
                  <CaseCard caseItem={caseItem} center={center} showPriorityLabel />
                </Grid2>
              ))}
            </Grid2>
          </AccordionDetails>
        </Accordion>

        <Accordion defaultExpanded disableGutters sx={accordionSectionSx}>
          <AccordionSummary
            expandIcon={<ExpandMore />}
            aria-label={`Procesados recientemente, ${processed.length} casos`}
            sx={accordionSummarySx}
          >
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{ color: ccviPalette.orange, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <AssignmentTurnedIn />
              </Box>
              <Typography variant="h5">Procesados recientemente</Typography>
              <CountBadge count={processed.length} label="casos procesados recientemente" />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={scrollableAccordionDetailsSx}>
            <Grid2 container spacing={3}>
              {processed.length === 0 && (
                <Grid2 size={{ xs: 12 }}>
                  <EmptyState text="Aún no hay casos procesados por esta ventanilla." />
                </Grid2>
              )}
              {processed.map((caseItem) => (
                <Grid2 size={{ xs: 12, md: 6 }} key={caseItem.caseId}>
                  <CaseCard caseItem={caseItem} center={center} processed showPriorityLabel />
                </Grid2>
              ))}
            </Grid2>
          </AccordionDetails>
        </Accordion>
      </Stack>
      <Dialog
        open={Boolean(priorityDialogCase) || priorityCreationOpen}
        onClose={createdPriorityCase ? undefined : closePriorityDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ px: { xs: 2.5, sm: 3 }, pt: { xs: 2.5, sm: 3 }, pb: 1.5 }}>
          <Typography variant="h5" component="span" fontWeight={700}>
          {createdPriorityCase
            ? "Turno preferencial creado"
            : priorityCreationOpen
              ? "Crear turno preferencial"
            : priorityDialogCase?.isPriority
              ? "Atención preferencial"
              : "Crear atención preferencial"}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {createdPriorityCase ? (
            <Stack spacing={3} alignItems="center" sx={{ pt: 1, mx: "auto", maxWidth: 480 }}>
              <Typography variant="h3" component="p" color="primary" fontWeight={800}>
                {createdPriorityCase.publicCode} P
              </Typography>
              <Typography textAlign="center" sx={{ maxWidth: 440, lineHeight: 1.6 }}>
                Muestre este código QR a la persona para que pueda seguir el estado de su atención.
              </Typography>
              <Box sx={{ p: 2, display: "grid", placeItems: "center" }}>
                <QRCodeSVG
                  value={getPublicStatusUrl(createdPriorityCase.publicToken)}
                  size={200}
                  title={`Código QR del turno preferencial ${createdPriorityCase.publicCode}`}
                />
              </Box>
              <Typography variant="h5" component="p" fontWeight={700}>
                {createdPriorityCase.publicCode} P
              </Typography>
              <Typography color="text.secondary" textAlign="center">
                Escanee el código con la cámara del teléfono.
              </Typography>
            </Stack>
          ) : priorityCreationOpen ? (
            <Typography sx={{ pt: 1 }}>
              Se generará un nuevo turno con atención preferencial.
            </Typography>
          ) : (
            <>
          {priorityDialogCase?.isPriority && priorityDialogCase.priorityType && (
            <Stack spacing={0.75} sx={{ mt: 1, mb: 2 }}>
              <Typography>Este turno está registrado como atención preferencial.</Typography>
              <Typography color="text.secondary">
                Motivo actual: {priorityTypeLabels[priorityDialogCase.priorityType]}.
              </Typography>
            </Stack>
          )}
          <FormControl sx={{ mt: 1, width: "100%" }}>
            <FormLabel id="priority-type-label">
              {priorityCreationOpen
                ? "Seleccione el tipo de atención preferencial."
                : priorityDialogCase?.isPriority
                  ? "Cambiar motivo"
                  : "Seleccione el motivo por el que esta atención requiere prioridad."}
            </FormLabel>
            <RadioGroup
              aria-labelledby="priority-type-label"
              value={selectedPriorityType}
              onChange={(event) => setSelectedPriorityType(event.target.value as PriorityType)}
              sx={{ mt: 1 }}
            >
              {priorityTypeOptions.map((option) => (
                <FormControlLabel
                  key={option.value}
                  value={option.value}
                  control={<Radio />}
                  label={option.label}
                />
              ))}
            </RadioGroup>
          </FormControl>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2.5, sm: 3 }, pt: 2, pb: { xs: 2.5, sm: 3 } }}>
          {createdPriorityCase ? (
            <Button variant="contained" onClick={closePriorityDialog}>Finalizar</Button>
          ) : (
            <>
          <Button onClick={closePriorityDialog}>Cancelar</Button>
          {priorityDialogCase?.isPriority && (
            <Button
              color="error"
              variant="outlined"
              onClick={() => {
                setPriorityRemovalCase(priorityDialogCase);
                closePriorityDialog();
              }}
            >
              Quitar atención preferencial
            </Button>
          )}
          <Button
            variant="contained"
            disabled={
              isCreatingPriority ||
              (!priorityCreationOpen &&
                (!selectedPriorityType ||
                (!priorityDialogCase ||
                  (priorityDialogCase.isPriority &&
                    priorityDialogCase.priorityType === selectedPriorityType))))
            }
            onClick={async () => {
              if (priorityCreationOpen) {
                setIsCreatingPriority(true);
                try {
                  const result = await createPriorityArrivalRealtime(
                    data,
                    operatorWindow.serviceType,
                    "other",
                    role,
                  );
                  setData(() => result.data);
                  if (result.createdCase) setCreatedPriorityCase(result.createdCase);
                } catch (error) {
                  console.error("No se pudo crear el turno preferencial.", error);
                } finally {
                  setIsCreatingPriority(false);
                }
                return;
              }
              if (!selectedPriorityType) return;
              if (!priorityDialogCase) return;
              const priorityCaseId = priorityDialogCase.caseId;
              const priorityWasSet = priorityDialogCase.isPriority;
              closePriorityDialog();
              const next = priorityWasSet
                ? await updateCasePriorityRealtime(
                    data,
                    priorityCaseId,
                    selectedPriorityType,
                    role,
                  )
                : await markCaseAsPriorityRealtime(
                    data,
                    priorityCaseId,
                    selectedPriorityType,
                    role,
                  );
              setData(() => next);
            }}
          >
            {priorityCreationOpen
              ? "Crear turno preferencial"
              : priorityDialogCase?.isPriority
                ? "Cambiar motivo"
                : "Crear atención preferencial"}
          </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(priorityRemovalCase)}
        onClose={() => setPriorityRemovalCase(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Quitar atención preferencial</DialogTitle>
        <DialogContent>
          <Typography>Este turno volverá a tratarse como una atención regular.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPriorityRemovalCase(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (!priorityRemovalCase) return;
              const priorityCaseId = priorityRemovalCase.caseId;
              setPriorityRemovalCase(null);
              const next = await removeCasePriorityRealtime(
                data,
                priorityCaseId,
                role,
              );
              setData(() => next);
            }}
          >
            Quitar atención preferencial
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(rejectionDialogCase)} onClose={closeRejectionDialog} fullWidth maxWidth="sm">
        <DialogTitle>Registrar contacto</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography>
              Estos datos permitirán contactar a la persona si es necesario.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ambos campos son opcionales. Puede continuar aunque la persona no entregue estos datos.
            </Typography>
            <TextField
              label="Nombre y apellido"
              value={rejectedCustomerName}
              onChange={(event) => setRejectedCustomerName(event.target.value)}
              autoComplete="name"
              fullWidth
            />
            <TextField
              label="Teléfono de contacto"
              type="tel"
              value={rejectedCustomerPhone}
              onChange={(event) => setRejectedCustomerPhone(event.target.value)}
              helperText="Ejemplo: +56 9 1234 5678"
              autoComplete="tel"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={closeRejectionDialog}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              if (!rejectionDialogCase) return;
              const rejectedCaseId = rejectionDialogCase.caseId;
              const rejectedContact = {
                customerName: rejectedCustomerName,
                customerPhone: rejectedCustomerPhone,
              };
              closeRejectionDialog();
              const next = await finishDocumentValidationRealtime(
                data,
                rejectedCaseId,
                "rejected",
                role,
                rejectedContact,
              );
              setData(() => next);
            }}
          >
            Guardar y rechazar
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  );
};

const CashierView = ({
  cashierId,
  data,
  setData,
}: {
  cashierId: string;
  data: AppData;
  setData: (updater: (data: AppData) => AppData) => void;
}) => {
  const center = getCurrentCenter(data);
  const [paymentIssue, setPaymentIssue] = useState<{ queueItemId: string; publicCode: string } | null>(null);
  const waitingCount = Object.values(data.paymentQueue).filter(
    (item) => item.centerId === data.selectedCenterId && item.state === "waiting_cashier",
  ).length;
  const active = Object.values(data.paymentQueue).find(
    (item) =>
      item.centerId === data.selectedCenterId &&
      item.cashierId === cashierId &&
      (item.state === "called_to_cashier" || item.state === "in_cashier_attention"),
  );
  const activeCase = active ? data.cases[active.caseId] : null;
  const pausedPayments = Object.values(data.paymentQueue)
    .filter((item) => item.centerId === data.selectedCenterId && item.state === "paused")
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const canCallNextCashier = !active && waitingCount > 0;

  return (
    <Page
      title={center.cashiers.find((cashier) => cashier.cashierId === cashierId)?.name ?? "Caja"}
      description="Llama el siguiente turno aprobado, retira la carpeta física indicada y registra la atención cuando la persona se presente en caja."
    >
      <Grid container spacing={3} alignItems="stretch">
        <Grid item xs={12} lg={4} sx={{ display: "flex" }}>
          <Card
            sx={{
              ...operationalCardSx,
              width: "100%",
              height: "100%",
              bgcolor: ccviPalette.navy,
              color: "white",
            }}
          >
            <Box
              sx={{
                px: { xs: 2, md: 2.5 },
                py: 2,
                borderBottom: "1px solid rgba(255,255,255,0.16)",
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <Box sx={{ color: ccviPalette.orange, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Payments />
                </Box>
                <Typography variant="h5" color="inherit">
                  Cola única de caja
                </Typography>
              </Stack>
            </Box>
            <CardContent sx={{ height: "calc(100% - 73px)" }}>
              <Stack spacing={2} sx={{ height: "100%" }}>
                <Typography sx={{ opacity: 0.82 }}>
                  El sistema asigna el caso aprobado más antiguo.
                </Typography>
                <Stack
                  direction="row"
                  alignItems="baseline"
                  spacing={1.25}
                  sx={{ flexWrap: "wrap" }}
                >
                  <Typography variant="h3" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {waitingCount}
                  </Typography>
                  <Typography variant="h6" sx={{ opacity: 0.86 }}>
                    casos esperando caja
                  </Typography>
                </Stack>
                <Button
                  color="secondary"
                  variant="contained"
                  startIcon={<Payments />}
                  disabled={!canCallNextCashier}
                  title={
                    active
                      ? "Finalice o pause el ticket activo antes de llamar otro turno."
                      : waitingCount === 0
                        ? "No hay turnos aprobados esperando caja."
                        : "Llamar el siguiente turno aprobado"
                  }
                  sx={{ mt: "auto" }}
                  onClick={async () => {
                    const next = await callNextForCashierRealtime(data, cashierId);
                    setData(() => next);
                  }}
                >
                  Llamar siguiente
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={8} sx={{ display: "flex" }}>
          <Box
            sx={{
              ...sectionContainerSx,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box sx={{ ...sectionHeaderSx, flexShrink: 0 }}>
              <SectionHeader
                icon={<Payments />}
                title={active && activeCase ? "Turno en caja" : "Ticket asignado"}
                count={active && activeCase ? 1 : 0}
                countLabel={active && activeCase ? "turno en caja" : "tickets asignados"}
              />
            </Box>
            <Box
              sx={{
                ...groupedCardsSurfaceSx,
                flex: 1,
                minHeight: { xs: 180, lg: 0 },
                display: "flex",
                alignItems: "stretch",
              }}
            >
              {!active || !activeCase ? (
                <Box sx={{ width: "100%", minHeight: "100%", display: "flex" }}>
                  <Card
                    variant="outlined"
                    sx={{
                      width: "100%",
                      minHeight: "100%",
                      borderRadius: surfaceRadius,
                      bgcolor: "rgba(255,255,255,0.9)",
                      boxShadow: "none",
                    }}
                  >
                    <CardContent
                      sx={{
                        height: "100%",
                        minHeight: "100%",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Stack spacing={1.5} sx={{ width: "100%" }}>
                        <Typography variant="h6">Sin ticket asignado</Typography>
                        <Typography color="text.secondary">
                          {waitingCount > 0
                            ? "Presione “Llamar siguiente” para asignar a esta caja el turno aprobado más antiguo."
                            : "No hay turnos aprobados esperando caja en este momento."}
                        </Typography>
                        <Alert severity={waitingCount > 0 ? "info" : "warning"}>
                          {waitingCount > 0
                            ? "El sistema asignará el caso automáticamente según el orden de aprobación."
                            : "Cuando una ventanilla apruebe un trámite, aparecerá en la cola única de caja."}
                        </Alert>
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>
              ) : (
                <CaseCard caseItem={activeCase} center={center} prominent showPriorityLabel>
                  <Alert severity="info">
                    Retirar carpeta <strong>{active.folderCode}</strong> del punto físico compartido.
                  </Alert>
                  {active.state === "called_to_cashier" && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant="contained"
                        onClick={async () => {
                          const next = await startCashierAttentionRealtime(
                            data,
                            active.queueItemId,
                          );
                          setData(() => next);
                        }}
                      >
                        Iniciar atención
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={async () => {
                          const next = await markNoShowRealtime(data, active.queueItemId);
                          setData(() => next);
                        }}
                      >
                        No se presentó
                      </Button>
                    </Stack>
                  )}
                  {active.state === "in_cashier_attention" && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircle />}
                        onClick={async () => {
                          const next = await completePaymentRealtime(data, active.queueItemId);
                          setData(() => next);
                        }}
                      >
                        Pago completado
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<WarningAmber />}
                        onClick={() =>
                          setPaymentIssue({ queueItemId: active.queueItemId, publicCode: activeCase.publicCode })
                        }
                      >
                        Pago no realizado
                      </Button>
                    </Stack>
                  )}
                </CaseCard>
              )}
            </Box>
          </Box>
        </Grid>
        <Grid item xs={12}>
          <Accordion disableGutters sx={accordionSectionSx}>
            <AccordionSummary
              expandIcon={<ExpandMore />}
              aria-label={`Pagos pendientes, ${pausedPayments.length} turnos`}
              sx={accordionSummarySx}
            >
              <SectionHeader
                icon={<WarningAmber />}
                title="Pagos pendientes"
                count={pausedPayments.length}
                countLabel="pagos pendientes"
              />
            </AccordionSummary>
            <AccordionDetails sx={scrollableAccordionDetailsSx}>
              <Grid container spacing={2}>
                {pausedPayments.length === 0 && (
                  <Grid item xs={12}>
                    <EmptyState text="No hay pagos pendientes por retomar." />
                  </Grid>
                )}
                {pausedPayments.map((item) => {
                  const pausedCase = data.cases[item.caseId];
                  if (!pausedCase) return null;

                  return (
                    <Grid item xs={12} md={6} key={item.queueItemId}>
                      <CaseCard caseItem={pausedCase} center={center} compact showPriorityLabel>
                        <Alert severity="warning">
                          El pago no fue completado. Retome este turno cuando la persona pueda continuar en caja.
                        </Alert>
                        {pausedCase.optionalInternalNote && (
                          <Typography color="text.secondary">
                            Nota interna: {pausedCase.optionalInternalNote}
                          </Typography>
                        )}
                        <Button
                          variant="outlined"
                          disabled={Boolean(active)}
                          onClick={async () => {
                            const next = await resumePausedPaymentRealtime(
                              data,
                              item.queueItemId,
                              cashierId,
                            );
                            setData(() => next);
                          }}
                        >
                          Retomar atención
                        </Button>
                      </CaseCard>
                    </Grid>
                  );
                })}
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>
      <PaymentIssueDialog
        open={Boolean(paymentIssue)}
        publicCode={paymentIssue?.publicCode ?? ""}
        onCancel={() => setPaymentIssue(null)}
        onConfirm={async (note) => {
          if (!paymentIssue) return;
          const queueItemId = paymentIssue.queueItemId;
          setPaymentIssue(null);
          const next = await pausePaymentRealtime(data, queueItemId, cashierId, note);
          setData(() => next);
        }}
      />
    </Page>
  );
};

const PaymentIssueDialog = ({
  open,
  publicCode,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  publicCode: string;
  onCancel: () => void;
  onConfirm: (note: string | null) => void;
}) => {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setNote("");
    }
  }, [open, publicCode]);

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Registrar pago no realizado</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="warning" icon={<WarningAmber />}>
            El pago del turno {publicCode} no será registrado como completado.
          </Alert>
          <Typography color="text.secondary">
            Use esta opción si el pago fue rechazado, no pudo procesarse o la persona no puede completarlo en este momento.
          </Typography>
          <Typography color="text.secondary">
            El turno quedará pendiente, conservará su mismo número de atención y la caja quedará disponible para llamar o retomar otro turno.
          </Typography>
          <TextField
            label="Nota interna opcional"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            helperText="No escriba datos personales. Use una nota breve solo si ayuda al seguimiento interno."
            multiline
            minRows={2}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onCancel}>
          Volver a caja
        </Button>
        <Button
          variant="contained"
          color="warning"
          startIcon={<WarningAmber />}
          onClick={() => onConfirm(note.trim() || null)}
        >
          Registrar pago no realizado
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const DisplayView = ({ data }: { data: AppData }) => {
  const dayId = getCurrentSession(data)?.date;
  const [events, setEvents] = useState<PublicDisplayCallEvent[]>([]);
  const [activeEntries, setActiveEntries] = useState<PublicDisplayEntry[]>([]);
  const [currentCall, setCurrentCall] = useState<PublicDisplayCallEvent | null>(null);
  const [pendingCalls, setPendingCalls] = useState<PublicDisplayCallEvent[]>([]);
  const knownEventIdsRef = useRef(new Set<string>());
  const initializedRef = useRef(false);
  const currentShownAtRef = useRef(0);

  useEffect(() => {
    setEvents([]);
    setCurrentCall(null);
    setPendingCalls([]);
    knownEventIdsRef.current = new Set();
    initializedRef.current = false;
    currentShownAtRef.current = 0;
    if (!dayId) return undefined;
    try {
      return subscribeToPublicDisplayCalls(
        data.selectedCenterId,
        dayId,
        (nextEvents) => {
          setEvents(nextEvents);
          if (!initializedRef.current) {
            initializedRef.current = true;
            knownEventIdsRef.current = new Set(nextEvents.map((event) => event.eventId));
            const latest = nextEvents[nextEvents.length - 1] ?? null;
            setCurrentCall(latest);
            currentShownAtRef.current = latest ? Date.now() : 0;
            return;
          }

          const newEvents = nextEvents.filter(
            (event) => !knownEventIdsRef.current.has(event.eventId),
          );
          nextEvents.forEach((event) => knownEventIdsRef.current.add(event.eventId));
          if (newEvents.length > 0) {
            setPendingCalls((current) => [...current, ...newEvents]
              .sort((a, b) => a.calledAt - b.calledAt || a.eventId.localeCompare(b.eventId)));
          }
        },
        () => setEvents([]),
      );
    } catch {
      setEvents([]);
      return undefined;
    }
  }, [data.selectedCenterId, dayId]);

  useEffect(() => {
    setActiveEntries([]);
    if (!dayId) return undefined;
    try {
      return subscribeToPublicDisplay(
        data.selectedCenterId,
        dayId,
        setActiveEntries,
        () => setActiveEntries([]),
      );
    } catch {
      setActiveEntries([]);
      return undefined;
    }
  }, [data.selectedCenterId, dayId]);

  useEffect(() => {
    if (pendingCalls.length === 0) return undefined;
    const elapsed = currentCall ? Date.now() - currentShownAtRef.current : 6000;
    const delay = currentCall ? Math.max(0, 6000 - elapsed) : 0;
    const timer = window.setTimeout(() => {
      setPendingCalls((queued) => {
        const [next, ...remaining] = queued;
        if (!next) return queued;
        setCurrentCall(next);
        currentShownAtRef.current = Date.now();
        playDisplayCallSound();
        return remaining;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [currentCall, pendingCalls]);

  const newestEvents = [...events].sort((a, b) => b.calledAt - a.calledAt);
  const recentCalls = newestEvents.slice(0, 5);
  const activeCalls = activeEntries
    .filter((entry) => /^Diríjase a\b/i.test(entry.status))
    .map((entry): PublicDisplayCallEvent => ({
      eventId: `active-${entry.publicCode}-${entry.destination}-${entry.updatedAt}`,
      publicCode: entry.publicCode,
      isPriority: entry.isPriority,
      destinationType: /^Ventanilla\b/i.test(entry.destination) ? "window" : "cashier",
      destinationLabel: entry.destination,
      calledAt: entry.updatedAt,
    }))
    .sort((a, b) => b.calledAt - a.calledAt);
  const windowCalls = activeCalls.filter((event) => event.destinationType === "window").slice(0, 2);
  const cashierCalls = activeCalls.filter((event) => event.destinationType === "cashier").slice(0, 5);

  return (
    <Box
      sx={{
        height: { xs: "auto", lg: "calc(100dvh - 92px)" },
        minHeight: { xs: "calc(100dvh - 80px)", lg: 0 },
        overflow: { xs: "visible", lg: "hidden" },
        backgroundImage:
          "linear-gradient(rgba(8, 20, 36, 0.62), rgba(8, 20, 36, 0.72)), url('/ccvi-login-background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: { lg: "fixed" },
        p: { xs: 2, sm: 3, lg: 4 },
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" },
          gridTemplateRows: { xs: "auto", lg: "minmax(0, 31fr) minmax(0, 69fr)" },
          gridTemplateAreas: {
            xs: '"current" "recent" "window" "cashier"',
            lg: '"current window" "recent cashier"',
          },
          gap: { xs: 2, lg: 3 },
          maxWidth: 1440,
          height: "100%",
          mx: "auto",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <Box sx={{ gridArea: "current", minWidth: 0, minHeight: 0 }}>
          <DisplayPanel
            title="Llamando ahora"
            meta="EN PANTALLA"
            icon={<Campaign />}
            entries={currentCall ? [currentCall] : []}
            current
          />
        </Box>
        <Box sx={{ gridArea: "recent", minWidth: 0, minHeight: 0 }}>
          <DisplayPanel
            title="Últimos llamados"
            meta="Historial"
            icon={<Monitor />}
            entries={recentCalls}
          />
        </Box>
        <Box sx={{ gridArea: "window", minWidth: 0, minHeight: 0 }}>
          <DisplayPanel
            title="Ventana"
            meta="Atención"
            icon={<BusinessCenter />}
            entries={windowCalls}
          />
        </Box>
        <Box sx={{ gridArea: "cashier", minWidth: 0, minHeight: 0 }}>
          <DisplayPanel
            title="Caja"
            meta="Pagos"
            icon={<Payments />}
            entries={cashierCalls}
          />
        </Box>
      </Box>
    </Box>
  );
};

const DisplayPanel = ({
  title,
  meta,
  icon,
  entries,
  current = false,
}: {
  title: string;
  meta: string;
  icon: ReactNode;
  entries: PublicDisplayCallEvent[];
  current?: boolean;
}) => (
  <Card
    component="section"
    aria-labelledby={`display-${title.toLowerCase().replace(/ /g, "-")}`}
    sx={{
      border: "1px solid #D1D5DB",
      borderRadius: "16px",
      bgcolor: "rgba(255,255,255,0.98)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      boxShadow: "0 14px 36px rgba(8, 20, 36, 0.24)",
    }}
  >
    <Box
      sx={{
        minHeight: 58,
        px: { xs: 2, md: 2.5 },
        py: 1.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        borderBottom: "1px solid #D1D5DB",
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{ color: ccviPalette.orange, display: "grid", placeItems: "center" }}>{icon}</Box>
        <Typography
          id={`display-${title.toLowerCase().replace(/ /g, "-")}`}
          component="h2"
          variant="h5"
          sx={{ color: "#111C33", fontWeight: 700 }}
        >
          {title}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        {current && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: ccviPalette.orange }} />}
        <Typography variant="body2" sx={{ color: "#6B7280" }}>{meta}</Typography>
      </Stack>
    </Box>
    <CardContent
      sx={{
        p: current ? { xs: 2, lg: 1.5 } : { xs: 1.25, lg: 1 },
        bgcolor: current ? "#B4C3D7" : "#F3F4F6",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        "&:last-child": { pb: current ? { xs: 2, lg: 1.5 } : { xs: 1.25, lg: 1 } },
      }}
    >
      <Stack spacing={current ? 0 : 1} sx={{ height: "100%", minHeight: 0 }}>
        {entries.length === 0 && (
          <Box sx={{ flex: 1, minHeight: current ? 112 : 52, display: "grid", placeItems: "center" }}>
            <Typography color="text.secondary">
              {current ? "En espera del próximo llamado" : "Aún no hay llamados registrados."}
            </Typography>
          </Box>
        )}
        {entries.map((entry) => {
          const accent = displayAccentFor(entry);
          return (
            <Box
              key={entry.eventId}
              sx={{
                position: "relative",
                overflow: "hidden",
                bgcolor: "white",
                border: current ? `1px solid ${accent}` : "1px solid #D1D5DB",
                borderRadius: current ? "24px" : "14px",
                boxShadow: current ? "0 8px 18px rgba(17, 28, 51, 0.16)" : "none",
                pl: current ? { xs: 3, md: 5 } : { xs: 2.25, md: 3 },
                pr: current ? { xs: 2.5, md: 4 } : { xs: 2, md: 2.5 },
                pt: current ? { xs: 2.5, lg: 2 } : { xs: 1, lg: 0.25 },
                pb: current ? { xs: 2.5, lg: 2 } : 1,
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: "0 auto 0 0",
                  width: current ? 12 : 7,
                  bgcolor: accent,
                },
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) 48px minmax(0, 1.25fr)" },
                  alignItems: "center",
                  gap: { xs: 1, sm: 2 },
                }}
              >
                <Box>
                  <Typography variant={current ? "subtitle1" : "caption"} sx={{ color: "#6B7280", fontWeight: 700 }}>
                    Usuario
                  </Typography>
                  <Typography
                    variant={current ? "h2" : "h5"}
                    aria-label={getAccessiblePublicTicketLabel(
                      entry.publicCode,
                      entry.isPriority,
                    )}
                    sx={{
                      color: "#111C33",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 800,
                      lineHeight: 1.05,
                      fontSize: current ? { xs: "2.4rem", md: "3.25rem" } : undefined,
                    }}
                  >
                    {formatPublicTicketLabel(entry.publicCode, entry.isPriority)}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: { xs: "none", sm: "grid" },
                    placeItems: "center",
                    width: current ? 46 : 38,
                    height: current ? 46 : 38,
                    borderRadius: "50%",
                    bgcolor: "#F3F4F6",
                    color: ccviPalette.orange,
                  }}
                  aria-hidden="true"
                >
                  <PlayArrow />
                </Box>
                <Box sx={{ textAlign: { xs: "left", sm: "right" }, minWidth: 0 }}>
                  <Typography variant={current ? "subtitle1" : "caption"} sx={{ color: "#6B7280", fontWeight: 700 }}>
                    Diríjase a
                  </Typography>
                  <Typography
                    variant={current ? "h2" : "h5"}
                    sx={{
                      color: "#111C33",
                      fontWeight: current ? 800 : 700,
                      lineHeight: 1.05,
                      overflowWrap: "anywhere",
                      fontSize: current ? { xs: "2rem", md: "3.25rem" } : undefined,
                    }}
                  >
                    {monitorDestinationLabel(entry.destinationLabel)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Stack>
    </CardContent>
  </Card>
);

const AdminView = ({
  data,
  setData,
}: {
  data: AppData;
  setData: (updater: (data: AppData) => AppData) => void;
}) => {
  const center = getCurrentCenter(data);
  const session = getCurrentSession(data);
  const availableSessions = Object.values(data.sessions)
    .filter((sessionItem) => sessionItem.centerId === center.centerId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const [selectedMetricsSessionId, setSelectedMetricsSessionId] = useState(session.sessionId);
  const [cashierPerformancePeriod, setCashierPerformancePeriod] = useState<"today" | "week" | "month">("today");
  const [rejectedUsersPeriod, setRejectedUsersPeriod] = useState<"today" | "week" | "month" | "year">("today");
  const selectedMetricsSession = data.sessions[selectedMetricsSessionId] ?? session;
  const metrics = calculateMetrics(data, selectedMetricsSession.sessionId);
  const cashierPerformance = useMemo(() => {
    const now = new Date();
    const periodStart = new Date(now);
    if (cashierPerformancePeriod === "today") {
      periodStart.setHours(0, 0, 0, 0);
    } else if (cashierPerformancePeriod === "week") {
      const daysSinceMonday = (periodStart.getDay() + 6) % 7;
      periodStart.setDate(periodStart.getDate() - daysSinceMonday);
      periodStart.setHours(0, 0, 0, 0);
    } else {
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);
    }
    const periodStartTimestamp = periodStart.getTime();
    const nowTimestamp = now.getTime();
    const groups = new Map<
      string,
      {
        cashierId: string;
        cashierName: string;
        completedCount: number;
        durations: number[];
        commissionRates: number[];
        commissionAmounts: number[];
      }
    >();

    Object.values(data.cases)
      .filter((caseItem) => {
        const completedAt = caseItem.paymentCompletedAt ?? caseItem.completedAt;
        return (
          caseItem.centerId === center.centerId &&
          caseItem.currentState === "completed" &&
          caseItem.cashierId &&
          typeof completedAt === "number" &&
          completedAt >= periodStartTimestamp &&
          completedAt <= nowTimestamp
        );
      })
      .forEach((caseItem) => {
        const cashierId = caseItem.cashierId as string;
        const cashierName = caseItem.cashierNameAtCompletion?.trim() || "Sin cajera/o asignado";
        const key = `${cashierId}::${cashierName}`;
        const group = groups.get(key) ?? {
          cashierId,
          cashierName,
          completedCount: 0,
          durations: [],
          commissionRates: [],
          commissionAmounts: [],
        };

        group.completedCount += 1;
        if (typeof caseItem.cashierDurationMs === "number" && caseItem.cashierDurationMs >= 0) {
          group.durations.push(caseItem.cashierDurationMs);
        }
        if (typeof caseItem.commissionRateApplied === "number") {
          group.commissionRates.push(caseItem.commissionRateApplied);
        }
        if (typeof caseItem.commissionAmount === "number") {
          group.commissionAmounts.push(caseItem.commissionAmount);
        }
        groups.set(key, group);
      });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        averageDurationMs:
          group.durations.length > 0
            ? group.durations.reduce((total, duration) => total + duration, 0) / group.durations.length
            : undefined,
        uniqueCommissionRates: Array.from(new Set(group.commissionRates)),
        totalCommission:
          group.commissionAmounts.length > 0
            ? group.commissionAmounts.reduce((total, amount) => total + amount, 0)
            : undefined,
      }))
      .sort(
        (a, b) =>
          b.completedCount - a.completedCount ||
          a.cashierName.localeCompare(b.cashierName, "es"),
      );
  }, [cashierPerformancePeriod, center.centerId, data.cases]);
  const clpFormatter = useMemo(
    () => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }),
    [],
  );
  const rejectedUsers = useMemo(() => {
    const now = new Date();
    const periodStart = new Date(now);

    if (rejectedUsersPeriod === "today") {
      periodStart.setHours(0, 0, 0, 0);
    } else if (rejectedUsersPeriod === "week") {
      const daysSinceMonday = (periodStart.getDay() + 6) % 7;
      periodStart.setDate(periodStart.getDate() - daysSinceMonday);
      periodStart.setHours(0, 0, 0, 0);
    } else if (rejectedUsersPeriod === "month") {
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);
    } else {
      periodStart.setMonth(0, 1);
      periodStart.setHours(0, 0, 0, 0);
    }

    const periodStartTimestamp = periodStart.getTime();
    const nowTimestamp = now.getTime();

    return Object.values(data.cases)
      .filter(
        (caseItem) =>
          caseItem.centerId === center.centerId &&
          caseItem.currentState === "rejected" &&
          caseItem.documentStatus === "rejected" &&
          typeof caseItem.documentValidationCompletedAt === "number" &&
          caseItem.documentValidationCompletedAt >= periodStartTimestamp &&
          caseItem.documentValidationCompletedAt <= nowTimestamp,
      )
      .sort(
        (a, b) =>
          (b.documentValidationCompletedAt as number) -
          (a.documentValidationCompletedAt as number),
      );
  }, [center.centerId, data.cases, rejectedUsersPeriod]);
  const rejectedAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [],
  );
  const formatCashierDuration = (milliseconds: number) => {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} min ${seconds} s`;
  };
  const [open, setOpen] = useState(false);
  const [editingCenterId, setEditingCenterId] = useState<string | null>(null);
  const [deletingCenterId, setDeletingCenterId] = useState<string | null>(null);
  const editingCenter = editingCenterId ? data.centers[editingCenterId] : null;
  const deletingCenter = deletingCenterId ? data.centers[deletingCenterId] : null;
  const canDeleteCenters = Object.keys(data.centers).length > 1;

  useEffect(() => {
    if (!availableSessions.some((sessionItem) => sessionItem.sessionId === selectedMetricsSessionId)) {
      setSelectedMetricsSessionId(session.sessionId);
    }
  }, [availableSessions, selectedMetricsSessionId, session.sessionId]);

  return (
    <Page
      title="Administrador"
      description="Supervisa la jornada, revisa métricas operativas, configura centros y consulta la trazabilidad reciente."
    >
      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", md: "center" }}
              sx={{ mb: 2 }}
            >
              <SectionTitle icon={<Dashboard />} title="Datos de operación" />
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", sm: "flex-start" }}
              >
                <TextField
                  select
                  label="Día de atención"
                  value={selectedMetricsSession.sessionId}
                  onChange={(event) => setSelectedMetricsSessionId(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  helperText="Seleccione la jornada que desea revisar."
                  sx={{ minWidth: { xs: "100%", sm: 220 } }}
                >
                  {availableSessions.map((sessionItem) => (
                    <MenuItem key={sessionItem.sessionId} value={sessionItem.sessionId}>
                      {sessionItem.date}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="outlined"
                  startIcon={<FileDownload />}
                  onClick={() => downloadMetricsCsv(center, selectedMetricsSession, metrics)}
                  sx={{ minHeight: 48 }}
                >
                  CSV
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PictureAsPdf />}
                  onClick={() => printMetricsPdf(center, selectedMetricsSession, metrics)}
                  sx={{ minHeight: 48 }}
                >
                  PDF
                </Button>
              </Stack>
            </Stack>
            <Alert severity="info" sx={{ mb: 2 }}>
              Las métricas se conservan por centro y jornada. Cada nuevo día laboral inicia una nueva secuencia de tickets
              por ventanilla.
            </Alert>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <MetricCard label="Llegadas" value={metrics.totalArrivals} tone="navy" />
              </Grid>
              <Grid item xs={6} md={3}>
                <MetricCard label="Representación" value={metrics.representationArrivals} />
              </Grid>
              <Grid item xs={6} md={3}>
                <MetricCard label="Propietarios" value={metrics.vehicleOwnerArrivals} />
              </Grid>
              <Grid item xs={6} md={3}>
                <MetricCard label="Finalizados" value={metrics.completed} tone="success" />
              </Grid>
              <Grid item xs={6} md={3}>
                <MetricCard label="Aprobados" value={metrics.approved} tone="orange" />
              </Grid>
              <Grid item xs={6} md={3}>
                <MetricCard label="Incompletos" value={metrics.incomplete} tone="warning" />
              </Grid>
              <Grid item xs={6} md={3}>
                <MetricCard label="Espera caja" value={metrics.waitingCashier} />
              </Grid>
              <Grid item xs={6} md={3}>
                <MetricCard label="En caja" value={metrics.inCashierAttention} tone="navy" />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <SectionTitle icon={<Monitor />} title="Indicadores de tiempo" />
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <MetricCard label="Prom. validación" value={formatDuration(metrics.averageValidationMs)} />
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard label="Prom. espera caja" value={formatDuration(metrics.averageCashierWaitMs)} />
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard label="Prom. atención caja" value={formatDuration(metrics.averageCashierHandlingMs)} />
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard label="Prom. ciclo total" value={formatDuration(metrics.averageEndToEndMs)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <SectionTitle icon={<Payments />} title="Rendimiento de cajas" />
            <ToggleButtonGroup
              value={cashierPerformancePeriod}
              exclusive
              onChange={(_event, period: "today" | "week" | "month" | null) => {
                if (period) setCashierPerformancePeriod(period);
              }}
              aria-label="Período de rendimiento de cajas"
              sx={{ mt: 2 }}
            >
              <ToggleButton value="today">Hoy</ToggleButton>
              <ToggleButton value="week">Semana</ToggleButton>
              <ToggleButton value="month">Mes</ToggleButton>
            </ToggleButtonGroup>
            {cashierPerformance.length === 0 ? (
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                No hay atenciones completadas para mostrar.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                <Table aria-label="Rendimiento de cajas y cajeras">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cajera/o</TableCell>
                      <TableCell>Caja</TableCell>
                      <TableCell align="right">Atenciones</TableCell>
                      <TableCell align="right">Tiempo promedio</TableCell>
                      <TableCell align="right">Bono por atención</TableCell>
                      <TableCell align="right">Bono total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cashierPerformance.map((item) => (
                      <TableRow key={`${item.cashierId}-${item.cashierName}`}>
                        <TableCell>{item.cashierName}</TableCell>
                        <TableCell>{item.cashierId.replace(/^cashier/i, "Caja ")}</TableCell>
                        <TableCell align="right">{item.completedCount}</TableCell>
                        <TableCell align="right">
                          {item.averageDurationMs === undefined
                            ? "Sin configurar"
                            : formatCashierDuration(item.averageDurationMs)}
                        </TableCell>
                        <TableCell align="right">
                          {item.uniqueCommissionRates.length === 0
                            ? "Sin configurar"
                            : item.uniqueCommissionRates.length === 1
                              ? clpFormatter.format(item.uniqueCommissionRates[0])
                              : "Variable"}
                        </TableCell>
                        <TableCell align="right">
                          {item.totalCommission === undefined
                            ? "Sin configurar"
                            : clpFormatter.format(item.totalCommission)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <SectionTitle icon={<Person />} title="Usuarios rechazados" />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Personas cuyo trámite no pudo continuar y cuyos datos de contacto fueron registrados durante la atención.
            </Typography>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
              sx={{ mt: 2 }}
            >
              <ToggleButtonGroup
                value={rejectedUsersPeriod}
                exclusive
                onChange={(_event, period: "today" | "week" | "month" | "year" | null) => {
                  if (period) setRejectedUsersPeriod(period);
                }}
                aria-label="Período de usuarios rechazados"
              >
                <ToggleButton value="today">Hoy</ToggleButton>
                <ToggleButton value="week">Semana</ToggleButton>
                <ToggleButton value="month">Mes</ToggleButton>
                <ToggleButton value="year">Año</ToggleButton>
              </ToggleButtonGroup>
              <Button
                variant="outlined"
                startIcon={<FileDownload />}
                disabled={rejectedUsers.length === 0}
                onClick={() => downloadRejectedUsersCsv(rejectedUsers, rejectedAtFormatter)}
                sx={{ minHeight: 48 }}
              >
                Descargar CSV
              </Button>
            </Stack>
            {rejectedUsers.length === 0 ? (
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                No hay usuarios rechazados para mostrar en este período.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, overflowX: "auto" }}>
                <Table aria-label="Usuarios rechazados" sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Número de atención</TableCell>
                      <TableCell>Ventanilla</TableCell>
                      <TableCell>Nombre y apellido</TableCell>
                      <TableCell>Teléfono</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rejectedUsers.map((caseItem) => (
                      <TableRow key={caseItem.caseId}>
                        <TableCell>
                          {rejectedAtFormatter.format(caseItem.documentValidationCompletedAt as number)}
                        </TableCell>
                        <TableCell>{caseItem.publicCode}</TableCell>
                        <TableCell>Ventanilla {caseItem.assignedWindowNumber}</TableCell>
                        <TableCell>{caseItem.rejectedCustomerName?.trim() || "Sin registrar"}</TableCell>
                        <TableCell>{caseItem.rejectedCustomerPhone?.trim() || "Sin registrar"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
        <Grid container spacing={3} alignItems="stretch">
          <Grid item xs={12} lg={5}>
            <Card sx={{ ...operationalCardSx, height: { lg: 560 }, display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
                  <SectionTitle icon={<AddBusiness />} title="Centros de atención" />
                  <Typography color="text.secondary">
                    El MVP ya permite crear centros y definir ventanillas/cajas por centro.
                  </Typography>
                  <Button variant="contained" startIcon={<AddBusiness />} onClick={() => setOpen(true)}>
                    Crear centro
                  </Button>
                  <Divider />
                  <Stack spacing={1.5} sx={{ overflow: "auto", pr: { lg: 0.5 }, flex: 1, minHeight: 0 }}>
                    {Object.values(data.centers).map((centerItem) => (
                      <Stack
                        key={centerItem.centerId}
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "stretch", sm: "center" }}
                        spacing={1.5}
                        sx={{ p: 1.5, borderRadius: controlRadius, bgcolor: "background.default" }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontWeight={800}>{centerItem.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {centerItem.windows.length} ventanillas ·{" "}
                            {centerItem.windows.filter((item) => item.serviceType === "representation").length} representación ·{" "}
                            {centerItem.windows.filter((item) => item.serviceType === "vehicle_owner").length} propietarios ·{" "}
                            {centerItem.cashiers.length} cajas
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Horario de atención: {formatServiceHours(centerItem)}
                          </Typography>
                        </Box>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
                          <Chip label={centerItem.shortCode} color={centerItem.centerId === center.centerId ? "secondary" : "default"} />
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Edit />}
                            onClick={() => setEditingCenterId(centerItem.centerId)}
                          >
                            Editar
                          </Button>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} lg={7}>
            <Card sx={{ ...operationalCardSx, height: { lg: 560 }, display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <SectionTitle icon={<Dashboard />} title="Trazabilidad reciente" />
                <Stack spacing={1.25} sx={{ mt: 2, overflow: "auto", flex: 1, minHeight: 0, pr: { lg: 0.5 } }}>
                  {data.events.slice(0, 18).map((traceEvent) => (
                    <Box key={traceEvent.eventId} sx={{ p: 1.5, bgcolor: "background.default", borderRadius: controlRadius }}>
                      <Typography fontWeight={800}>{formatTraceAction(traceEvent.action)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatTraceActor(traceEvent.actorRole)} · {formatTime(traceEvent.timestamp)}
                      </Typography>
                    </Box>
                  ))}
                  {data.events.length === 0 && (
                    <EmptyState text="Aún no hay actividad registrada durante esta jornada." />
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Alert severity="info">
          Jornada {session.date}. Horario de atención configurado: {formatServiceHours(center)}. Modo demo local activo;
          para producción se deben activar autenticación, roles y permisos por centro.
        </Alert>
      </Stack>
      <CreateCenterDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreate={async (name, code, representationWindows, ownerWindows, cashiers, serviceStartTime, serviceEndTime, cashierCommissionRate) => {
          const nextData = createCenter(
            data,
            name,
            code,
            representationWindows,
            ownerWindows,
            cashiers,
            serviceStartTime,
            serviceEndTime,
            cashierCommissionRate,
          );
          await writeCenterConfigRealtime(nextData.centers[nextData.selectedCenterId]);
          setData(() => nextData);
          setOpen(false);
        }}
      />
      {editingCenter && (
        <EditCenterDialog
          center={editingCenter}
          open={Boolean(editingCenter)}
          onClose={() => setEditingCenterId(null)}
          onSave={async (patch) => {
            const nextData = updateCenter(data, editingCenter.centerId, {
              ...patch,
              documentaryRequirements: editingCenter.documentaryRequirements,
              paymentMethods: editingCenter.paymentMethods,
            });
            await writeCenterConfigRealtime(nextData.centers[editingCenter.centerId]);
            setData(() => nextData);
            setEditingCenterId(null);
          }}
          canDelete={canDeleteCenters}
          onRequestDelete={() => setDeletingCenterId(editingCenter.centerId)}
        />
      )}
      {deletingCenter && (
        <DeleteCenterDialog
          centerName={deletingCenter.name}
          open={Boolean(deletingCenter)}
          onCancel={() => setDeletingCenterId(null)}
          onConfirm={async () => {
            const nextData = deleteCenter(data, deletingCenter.centerId);
            if (nextData !== data) {
              await removeCenterConfigRealtime(deletingCenter.centerId);
              setData(() => nextData);
            }
            setDeletingCenterId(null);
            setEditingCenterId(null);
          }}
        />
      )}
    </Page>
  );
};

const CreateCenterDialog = ({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    shortCode: string,
    representationWindows: number,
    ownerWindows: number,
    cashiers: number,
    serviceStartTime: string,
    serviceEndTime: string,
    cashierCommissionRate?: number,
  ) => void;
}) => {
  const [name, setName] = useState("Nuevo Centro CCVI");
  const [shortCode, setShortCode] = useState("NC");
  const [representationWindows, setRepresentationWindows] = useState(1);
  const [ownerWindows, setOwnerWindows] = useState(1);
  const [cashiers, setCashiers] = useState(3);
  const [serviceStartTime, setServiceStartTime] = useState("08:00");
  const [serviceEndTime, setServiceEndTime] = useState("17:00");
  const [cashierCommissionRate, setCashierCommissionRate] = useState("");
  const cleanName = name.trim();
  const cleanShortCode = shortCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const timeIsValid = serviceStartTime !== serviceEndTime;
  const representationCountIsValid =
    Number.isInteger(representationWindows) && representationWindows >= 1 && representationWindows <= 20;
  const ownerCountIsValid = Number.isInteger(ownerWindows) && ownerWindows >= 1 && ownerWindows <= 20;
  const cashierCountIsValid = Number.isInteger(cashiers) && cashiers >= 1 && cashiers <= 20;
  const parsedCashierCommissionRate =
    cashierCommissionRate.trim() === "" ? undefined : Number(cashierCommissionRate);
  const cashierCommissionRateIsValid =
    parsedCashierCommissionRate === undefined ||
    (Number.isFinite(parsedCashierCommissionRate) && parsedCashierCommissionRate >= 0);
  const canCreateCenter =
    cleanName.length > 0 &&
    cleanShortCode.length >= 2 &&
    representationCountIsValid &&
    ownerCountIsValid &&
    cashierCountIsValid &&
    cashierCommissionRateIsValid &&
    timeIsValid;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Crear centro de atención</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre del centro"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={cleanName.length === 0}
            helperText={cleanName.length === 0 ? "Ingrese un nombre visible para el personal." : "Ejemplo: CCVI San Bernardo."}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Código corto"
            value={shortCode}
            onChange={(event) => setShortCode(event.target.value)}
            error={cleanShortCode.length < 2}
            helperText="Use entre 2 y 4 letras o números. Ejemplo: SB."
            inputProps={{ maxLength: 4 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Ventanillas de representación"
            type="number"
            value={representationWindows}
            onChange={(event) => setRepresentationWindows(Number(event.target.value))}
            error={!representationCountIsValid}
            helperText="Ingrese un número entre 1 y 20."
            inputProps={{ min: 1, max: 20 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Ventanillas de propietarios"
            type="number"
            value={ownerWindows}
            onChange={(event) => setOwnerWindows(Number(event.target.value))}
            error={!ownerCountIsValid}
            helperText="Ingrese un número entre 1 y 20."
            inputProps={{ min: 1, max: 20 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Cantidad de cajas"
            type="number"
            value={cashiers}
            onChange={(event) => setCashiers(Number(event.target.value))}
            error={!cashierCountIsValid}
            helperText="Ingrese un número entre 1 y 20."
            inputProps={{ min: 1, max: 20 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Bono por atención de cliente"
            type="number"
            value={cashierCommissionRate}
            onChange={(event) => setCashierCommissionRate(event.target.value)}
            error={!cashierCommissionRateIsValid}
            helperText={
              cashierCommissionRateIsValid
                ? "Valor que recibe el personal de caja por cada atención completada en este centro."
                : "Ingrese un valor igual o mayor que 0."
            }
            inputProps={{ min: 0, step: 1 }}
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Inicio de atención"
              type="time"
              value={serviceStartTime}
              onChange={(event) => setServiceStartTime(event.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              helperText="Desde esta hora se pueden generar turnos."
            />
            <TextField
              fullWidth
              label="Término de atención"
              type="time"
              value={serviceEndTime}
              onChange={(event) => setServiceEndTime(event.target.value)}
              error={!timeIsValid}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              helperText={
                timeIsValid
                  ? "Fuera de este horario el tótem bloquea nuevos turnos."
                  : "La hora de inicio y término no pueden ser iguales."
              }
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={!canCreateCenter}
          onClick={() =>
            onCreate(
              cleanName,
              cleanShortCode,
              representationWindows,
              ownerWindows,
              cashiers,
              serviceStartTime,
              serviceEndTime,
              parsedCashierCommissionRate,
            )
          }
        >
          Crear centro
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const EditCenterDialog = ({
  center,
  open,
  onClose,
  onSave,
  canDelete,
  onRequestDelete,
}: {
  center: CenterConfig;
  open: boolean;
  onClose: () => void;
  onSave: (
    patch: Pick<
      CenterConfig,
      | "name"
      | "shortCode"
      | "timezone"
      | "serviceStartTime"
      | "serviceEndTime"
      | "kioskTimeoutSeconds"
      | "qrEnabled"
      | "cashiers"
      | "cashierCommissionRate"
    >,
  ) => void;
  canDelete: boolean;
  onRequestDelete: () => void;
}) => {
  const [name, setName] = useState(center.name);
  const [shortCode, setShortCode] = useState(center.shortCode);
  const [timezone, setTimezone] = useState(center.timezone);
  const [serviceStartTime, setServiceStartTime] = useState(center.serviceStartTime);
  const [serviceEndTime, setServiceEndTime] = useState(center.serviceEndTime);
  const [kioskTimeoutSeconds, setKioskTimeoutSeconds] = useState(center.kioskTimeoutSeconds);
  const [qrEnabled, setQrEnabled] = useState(center.qrEnabled);
  const [cashierCommissionRate, setCashierCommissionRate] = useState(
    center.cashierCommissionRate === undefined ? "" : String(center.cashierCommissionRate),
  );
  const [cashierNames, setCashierNames] = useState<Record<string, string>>(
    Object.fromEntries(center.cashiers.map((cashier) => [cashier.cashierId, cashier.cashierName ?? ""])),
  );
  const cleanName = name.trim();
  const cleanShortCode = shortCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const cleanTimezone = timezone.trim();
  const timeIsValid = serviceStartTime !== serviceEndTime;
  const timeoutIsValid =
    Number.isInteger(kioskTimeoutSeconds) && kioskTimeoutSeconds >= 8 && kioskTimeoutSeconds <= 30;
  const parsedCashierCommissionRate =
    cashierCommissionRate.trim() === "" ? undefined : Number(cashierCommissionRate);
  const cashierCommissionRateIsValid =
    parsedCashierCommissionRate === undefined ||
    (Number.isFinite(parsedCashierCommissionRate) && parsedCashierCommissionRate >= 0);
  const canSaveCenter =
    cleanName.length > 0 &&
    cleanShortCode.length >= 2 &&
    cleanTimezone.length > 0 &&
    timeIsValid &&
    timeoutIsValid &&
    cashierCommissionRateIsValid;

  useEffect(() => {
    setName(center.name);
    setShortCode(center.shortCode);
    setTimezone(center.timezone);
    setServiceStartTime(center.serviceStartTime);
    setServiceEndTime(center.serviceEndTime);
    setKioskTimeoutSeconds(center.kioskTimeoutSeconds);
    setQrEnabled(center.qrEnabled);
    setCashierCommissionRate(
      center.cashierCommissionRate === undefined ? "" : String(center.cashierCommissionRate),
    );
    setCashierNames(
      Object.fromEntries(center.cashiers.map((cashier) => [cashier.cashierId, cashier.cashierName ?? ""])),
    );
  }, [center]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar centro de atención</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre del centro"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={cleanName.length === 0}
            helperText={cleanName.length === 0 ? "Ingrese un nombre visible para el personal." : "Este nombre aparece en las vistas internas."}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Código corto"
            value={shortCode}
            onChange={(event) => setShortCode(event.target.value)}
            error={cleanShortCode.length < 2}
            helperText="Use entre 2 y 4 letras o números. Ejemplo: SB."
            inputProps={{ maxLength: 4 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Zona horaria"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            error={cleanTimezone.length === 0}
            helperText="Ejemplo: America/Santiago."
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Inicio de atención"
              type="time"
              value={serviceStartTime}
              onChange={(event) => setServiceStartTime(event.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              helperText="El tótem permitirá emitir turnos desde esta hora."
            />
            <TextField
              fullWidth
              label="Término de atención"
              type="time"
              value={serviceEndTime}
              onChange={(event) => setServiceEndTime(event.target.value)}
              error={!timeIsValid}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              helperText={
                timeIsValid
                  ? "Fuera de este horario no se generan nuevos turnos."
                  : "La hora de inicio y término no pueden ser iguales."
              }
            />
          </Stack>
          <TextField
            label="Tiempo visible del turno en tótem"
            type="number"
            value={kioskTimeoutSeconds}
            onChange={(event) => setKioskTimeoutSeconds(Number(event.target.value))}
            error={!timeoutIsValid}
            helperText="Entre 8 y 30 segundos."
            inputProps={{ min: 8, max: 30 }}
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={<Switch checked={qrEnabled} onChange={(event) => setQrEnabled(event.target.checked)} />}
            label="QR habilitado en tótem"
          />
          <TextField
            label="Bono por atención de cliente"
            type="number"
            value={cashierCommissionRate}
            onChange={(event) => setCashierCommissionRate(event.target.value)}
            error={!cashierCommissionRateIsValid}
            helperText={
              cashierCommissionRateIsValid
                ? "Valor que recibe el personal de caja por cada atención completada en este centro."
                : "Ingrese un valor igual o mayor que 0."
            }
            inputProps={{ min: 0, step: 1 }}
            InputLabelProps={{ shrink: true }}
          />
          <Box>
            <Typography fontWeight={900} sx={{ mb: 0.5 }}>
              Personal de caja
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Puede asociar una persona a cada caja sin cambiar el nombre visible de la estación.
            </Typography>
            <Stack spacing={2}>
              {center.cashiers.map((cashier) => (
                <Box key={cashier.cashierId}>
                  <Typography variant="body2" fontWeight={800} sx={{ mb: 1 }}>
                    {cashier.name}
                  </Typography>
                  <TextField
                    fullWidth
                    label="Nombre y apellido de cajera/o"
                    value={cashierNames[cashier.cashierId] ?? ""}
                    onChange={(event) =>
                      setCashierNames((current) => ({
                        ...current,
                        [cashier.cashierId]: event.target.value,
                      }))
                    }
                    helperText="Opcional. Puede agregarlo o modificarlo posteriormente."
                    InputLabelProps={{ shrink: true }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>
          <Alert severity="info">
            Las ventanillas y cajas creadas se conservan. La edición de cantidades se abordará en una configuración avanzada para evitar cambios accidentales durante una jornada.
          </Alert>
          <Box
            sx={{
              border: "1px solid",
              borderColor: "error.light",
              borderRadius: surfaceRadius,
              p: 2,
              bgcolor: "rgba(211, 47, 47, 0.04)",
            }}
          >
            <Stack spacing={1.5}>
              <Typography fontWeight={900} color="error.dark">
                Zona restrictiva
              </Typography>
              <Typography color="text.secondary">
                Eliminar este centro borra sus jornadas, turnos, cola de caja, eventos, métricas y configuración asociada. Esta acción no tiene vuelta atrás.
              </Typography>
              {!canDelete && (
                <Alert severity="warning">
                  No puedes eliminar este centro porque es el último centro disponible. Crea otro centro antes de eliminarlo.
                </Alert>
              )}
              <Box>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutline />}
                  disabled={!canDelete}
                  onClick={onRequestDelete}
                  sx={{
                    minHeight: 48,
                    px: 2.25,
                    borderWidth: 2,
                    borderColor: "error.main",
                    bgcolor: "background.paper",
                    color: "error.dark",
                    boxShadow: "0 10px 24px rgba(122, 31, 24, 0.08)",
                    "&:hover": {
                      borderWidth: 2,
                      borderColor: "error.dark",
                      bgcolor: "rgba(211, 47, 47, 0.10)",
                      boxShadow: "0 12px 28px rgba(122, 31, 24, 0.16)",
                    },
                    "&:focus-visible": {
                      outline: "3px solid rgba(211, 47, 47, 0.28)",
                      outlineOffset: 3,
                    },
                    "&:active": {
                      bgcolor: "rgba(211, 47, 47, 0.18)",
                      boxShadow: "0 4px 12px rgba(122, 31, 24, 0.18)",
                      transform: "translateY(1px)",
                    },
                    "&.Mui-disabled": {
                      borderColor: "divider",
                      bgcolor: "action.disabledBackground",
                    },
                  }}
                >
                  Eliminar centro
                </Button>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={!canSaveCenter}
          onClick={() =>
            onSave({
              name: cleanName,
              shortCode: cleanShortCode,
              timezone: cleanTimezone,
              serviceStartTime,
              serviceEndTime,
              kioskTimeoutSeconds,
              qrEnabled,
              cashierCommissionRate: parsedCashierCommissionRate,
              cashiers: center.cashiers.map((cashier) => ({
                ...cashier,
                cashierName: cashierNames[cashier.cashierId]?.trim() || undefined,
              })),
            })
          }
        >
          Guardar cambios
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const DeleteCenterDialog = ({
  centerName,
  open,
  onCancel,
  onConfirm,
}: {
  centerName: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const [confirmationText, setConfirmationText] = useState("");
  const canConfirm = confirmationText.trim().toUpperCase() === "ELIMINAR";

  useEffect(() => {
    if (open) {
      setConfirmationText("");
    }
  }, [open, centerName]);

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Eliminar centro de atención</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="error" icon={<DeleteOutline />}>
            Está a punto de eliminar el centro de atención "{centerName}". ¿Está seguro de su eliminación?
          </Alert>
          <Typography color="text.secondary">
            Esta acción no tiene vuelta atrás. Se eliminarán los datos asociados a este centro: jornadas, turnos,
            ventanillas, cajas, cola de caja, eventos de trazabilidad y métricas locales.
          </Typography>
          <Typography color="text.secondary">
            Si no está completamente seguro, seleccione "No eliminar" para volver a la edición del centro.
          </Typography>
          <TextField
            label="Escriba ELIMINAR para confirmar"
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Esta confirmación evita eliminaciones accidentales."
            autoComplete="off"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" onClick={onCancel}>
          No eliminar
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteOutline />}
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          Sí, eliminar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const publicStatusDetails = (status: string) => {
  if (status === "Guarde su número") return { step: 0, description: "Tome una fotografía de esta pantalla o conserve esta página para consultar su atención." };
  if (status === "Prepare su documentación") return { step: 1, description: "Mantenga sus documentos disponibles mientras espera el llamado." };
  if (status.startsWith("Diríjase a Ventanilla")) return { step: 2, description: "Su número fue llamado. Preséntese en la ventanilla indicada." };
  if (status === "Atención en ventanilla") return { step: 2, description: "El personal está revisando su documentación." };
  if (status === "Espere el llamado a caja") return { step: 3, description: "Vuelva al área de espera y mantenga preparado su medio de pago." };
  if (status === "Diríjase a caja" || status.startsWith("Diríjase a Caja")) return { step: 4, description: "Su número fue llamado para continuar con el pago." };
  if (status === "Atención en caja") return { step: 4, description: "Complete el pago siguiendo las indicaciones del personal." };
  if (status === "Trámite finalizado" || status === "Proceso finalizado con éxito") {
    return { step: 5, description: "Su atención en CCVI ha finalizado. Puede proceder al retiro de su vehículo." };
  }
  return { step: null, description: status };
};

const PublicStatusView = ({ token }: { token: string }) => {
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found" | "error">("loading");
  const [turnStatus, setTurnStatus] = useState<PublicTurnStatus | null>(null);

  useEffect(() => {
    setLoadState("loading");
    setTurnStatus(null);
    try {
      return subscribeToPublicTurnStatus(
        token,
        (status) => {
          setTurnStatus(status);
          setLoadState(status ? "found" : "not-found");
        },
        () => setLoadState("error"),
      );
    } catch {
      setLoadState("error");
      return undefined;
    }
  }, [token]);

  const hasVisiblePublicCode = turnStatus
    ? isVisiblePublicCode(turnStatus.publicCode)
    : false;
  const requirements = turnStatus?.requirements.map((label, index) => ({
    requirementId: `public-requirement-${index}`,
    label,
    enabled: true,
  })) ?? [];
  const paymentMethods = turnStatus?.paymentMethods.map((method, index) => ({
    paymentMethodId: `public-payment-${index}`,
    ...method,
  })) ?? [];
  const statusDetails = turnStatus ? publicStatusDetails(turnStatus.status) : null;
  const isCompletedStatus = turnStatus
    ? ["Trámite finalizado", "Proceso finalizado con éxito"].includes(turnStatus.status)
    : false;
  const displayedPublicCode = turnStatus
    ? `${turnStatus.publicCode}${turnStatus.isPriority ? " P" : ""}`
    : "";
  const publicStep = statusDetails?.step;
  const showPublicDestination = Boolean(
    turnStatus?.destination &&
    !turnStatus.status.startsWith("Diríjase a ") &&
    turnStatus.status !== "Atención en ventanilla" &&
    turnStatus.status !== "Atención en caja",
  );
  const showPublicRequirements = publicStep === 0 || publicStep === 1;
  const showPublicPaymentMethods = publicStep === 3 || publicStep === 4;

  return (
    <CenteredShell>
      <Card sx={{ width: "min(760px, 100%)" }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, "&:last-child": { pb: { xs: 2.5, sm: 4 } } }}>
          {loadState === "loading" ? (
            <Box role="status" aria-live="polite">
              <Typography>Cargando el estado de su atención...</Typography>
            </Box>
          ) : loadState === "error" ? (
            <Alert severity="error">No pudimos consultar este turno. Revise su conexión e intente nuevamente.</Alert>
          ) : loadState === "not-found" || !turnStatus || !hasVisiblePublicCode ? (
            <Alert severity="warning">No encontramos este turno. Revise el QR o consulte en ventanilla.</Alert>
          ) : (
            <Stack spacing={3}>
              <Stack spacing={1.5} textAlign="center" alignItems="center">
                <Chip label="Estado de su atención" color="secondary" />
                <Typography variant="overline" color="text.secondary" fontWeight={700}>
                  Su número de atención
                </Typography>
                <Typography
                  variant="h2"
                  color="primary"
                  aria-label={turnStatus.isPriority
                    ? `${getAccessiblePublicCode(turnStatus.publicCode)}, atención preferencial`
                    : getAccessiblePublicCode(turnStatus.publicCode)}
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {displayedPublicCode}
                </Typography>
                <Typography color="text.secondary">{turnStatus.serviceLabel}</Typography>
                <Typography variant="h5" color={isCompletedStatus ? "success.main" : "text.primary"}>
                  {isCompletedStatus ? "Proceso finalizado con éxito" : turnStatus.status}
                </Typography>
                {!isCompletedStatus && showPublicDestination && turnStatus.destination && (
                  <Typography color="text.secondary" fontWeight={700}>
                    {turnStatus.destination}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  Última actualización: {formatTime(turnStatus.updatedAt)}
                </Typography>
              </Stack>

              <Paper
                component="section"
                variant="outlined"
                aria-labelledby="current-public-instruction"
                sx={{
                  p: { xs: 2, sm: 2.5 },
                  bgcolor: isCompletedStatus ? "action.hover" : "#f7f9fc",
                  borderColor: isCompletedStatus ? "success.main" : undefined,
                }}
              >
                <Typography id="current-public-instruction" variant="h6" mb={1}>
                  Qué debe hacer ahora
                </Typography>
                <Typography color="text.secondary">
                  {statusDetails?.description}
                </Typography>
                {isCompletedStatus && (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Presente la documentación correspondiente al momento del retiro.
                  </Typography>
                )}
              </Paper>

              {!isCompletedStatus && (showPublicRequirements || showPublicPaymentMethods) && (
                <PublicJourneyInformation
                  requirements={requirements}
                  paymentMethods={paymentMethods}
                  showRequirements={showPublicRequirements && requirements.length > 0}
                  showPaymentMethods={showPublicPaymentMethods && paymentMethods.length > 0}
                />
              )}

              <Alert severity="info">
                Esta página no muestra datos personales, carpeta interna ni información documental.
              </Alert>
            </Stack>
          )}
        </CardContent>
      </Card>
    </CenteredShell>
  );
};

const SectionTitle = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1 }}>
    <Box sx={{ color: ccviPalette.orange, display: "grid", placeItems: "center" }}>{icon}</Box>
    <Typography variant="h5">{title}</Typography>
  </Stack>
);

const defaultPageDescription =
  "Revisa el estado de la jornada y realiza solo las acciones disponibles para este rol.";

const Page = ({
  title,
  description = defaultPageDescription,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <Container
    maxWidth="xl"
    sx={{
      pt: { xs: 3, md: 5 },
      pb: { xs: 12, md: 14 },
      px: { xs: 2, sm: 3, md: 4 },
    }}
  >
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ color: ccviPalette.navy }}>
          {title}
        </Typography>
        <Typography color="text.secondary">
          {description}
        </Typography>
      </Box>
      {children}
    </Stack>
  </Container>
);

const LoginShell = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      bgcolor: ccviPalette.navy,
      backgroundImage:
        "linear-gradient(rgba(0, 0, 0, 0.52), rgba(0, 0, 0, 0.52)), url('/ccvi-login-background.png')",
      backgroundSize: "cover",
      backgroundPosition: "center",
    }}
  >
    <Box
      component="header"
      sx={{
        minHeight: { xs: 80, sm: 96 },
        px: { xs: 2, sm: 3, md: 6 },
        py: 1,
        bgcolor: "#111C33",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={{ xs: 1.5, sm: 2.5 }} minWidth={0}>
        <AppLogo size={64} />
        <Box minWidth={0}>
          <Typography color="common.white" fontWeight={700} noWrap>
            CCVI | Panel Administrativo
          </Typography>
          <Typography
            color="#B4C3D7"
            sx={{ display: { xs: "none", sm: "block" } }}
          >
            Centro de control de atención
          </Typography>
        </Box>
      </Stack>
      <Typography color="#B4C3D7" variant="body2" sx={{ display: { xs: "none", md: "block" } }}>
        Panel Administrativo
      </Typography>
    </Box>

    <Box
      component="main"
      sx={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        width: "100%",
        px: { xs: 2, sm: 3 },
        py: { xs: 4, sm: 6 },
      }}
    >
      <Paper
        elevation={16}
        sx={{
          width: "100%",
          maxWidth: 640,
          borderRadius: 3,
          px: { xs: 2.5, sm: 4 },
          py: { xs: 3, sm: 5 },
        }}
      >
        {children}
      </Paper>
    </Box>
  </Box>
);

const App = () => {
  const [data, setDataState] = useState<AppData>(() => loadData());
  const [remoteOperationalDay, setRemoteOperationalDay] =
    useState<OperationalDaySnapshot | null>(null);
  const [role, setRoleState] = useState<Role>(() => getRoleFromUrl());
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [authSession, setAuthSession] = useState<AuthSessionState>({
    status: "loading",
    user: null,
    profile: null,
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const publicToken = useMemo(() => {
    const match = window.location.pathname.match(/^\/turno\/(.+)$/);
    return match?.[1] ?? null;
  }, []);
  const publicSurfaceRole = useMemo<Role | null>(() => {
    if (window.location.pathname === "/totem") return "kiosk";
    if (window.location.pathname === "/monitor") return "display";
    return null;
  }, []);
  const requestedRole = useMemo(
    () => new URLSearchParams(window.location.search).get("role"),
    [],
  );
  const loginRouteRequested = window.location.pathname === "/login";
  const legacyPrivateEntryRequested = Boolean(
    requestedRole && ["admin", "operator-window-1", "operator-window-2", "cashier"].includes(requestedRole),
  );
  const privateAccessRequested = loginRouteRequested || legacyPrivateEntryRequested;

  useEffect(() => observeAuthSession(setAuthSession), []);

  const setData = (updater: (data: AppData) => AppData) => {
    setDataState((current) => {
      const next = updater(current);
      saveData(next);
      return next;
    });
  };

  const setRole = (nextRole: Role) => {
    setRoleState(nextRole);
    window.localStorage.setItem("ccvi-role", nextRole);
    setSnackbar(`Vista cambiada a ${roleLabels[nextRole]}`);
  };

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (
      authSession.status !== "authenticated" ||
      !authSession.profile.enabled ||
      authSession.profile.role !== "admin"
    ) {
      return;
    }

    let cancelled = false;

    const bootstrapCenterConfigs = async () => {
      for (const center of Object.values(data.centers)) {
        if (cancelled) return;
        try {
          const existingCenter = await getCenterConfigRealtime(center.centerId);
          if (!cancelled && !existingCenter) {
            await writeCenterConfigRealtime(center);
          } else if (!cancelled && existingCenter) {
            await writePublicKioskConfigRealtime(existingCenter);
          }
        } catch (error) {
          console.error(
            "No se pudo sincronizar la configuración del centro",
            center.centerId,
            error,
          );
        }
      }
    };

    void bootstrapCenterConfigs();
    return () => {
      cancelled = true;
    };
  }, [authSession]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "ccvi-control-atencion-demo-v2-3" && event.newValue) {
        setDataState(loadData());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const selectedCenterId = data.selectedCenterId;
  const selectedDayId = getCurrentSession(data)?.date;
  const authenticatedProfile = authSession.status === "authenticated"
    ? authSession.profile
    : null;
  const hasAuthorizedCenter = Boolean(
    authenticatedProfile?.centerIds.includes(selectedCenterId),
  );

  useEffect(() => {
    if (!authenticatedProfile || hasAuthorizedCenter) return;
    const firstAuthorizedCenterId = authenticatedProfile.centerIds.find(
      (centerId) => Boolean(data.centers[centerId]),
    );
    if (firstAuthorizedCenterId) {
      setData((current) => selectCenter(current, firstAuthorizedCenterId));
    }
  }, [authenticatedProfile, data.centers, hasAuthorizedCenter]);

  useEffect(() => {
    setRemoteOperationalDay(null);
    if (!selectedDayId) return;
    if (authenticatedProfile && !hasAuthorizedCenter) return;

    return subscribeToOperationalDay(
      selectedCenterId,
      selectedDayId,
      setRemoteOperationalDay,
    );
  }, [authenticatedProfile, hasAuthorizedCenter, selectedCenterId, selectedDayId]);

  useEffect(() => {
    if (authSession.status === "authenticated" && privateAccessRequested) {
      window.history.replaceState(null, "", "/");
      return;
    }
    if (authSession.status !== "loading" && legacyPrivateEntryRequested) {
      window.history.replaceState(null, "", "/login");
    }
  }, [authSession.status, legacyPrivateEntryRequested, privateAccessRequested]);

  if (publicToken) {
    return <PublicStatusView token={publicToken} />;
  }

  if (privateAccessRequested && authSession.status !== "authenticated") {
    if (authSession.status === "loading") {
      return <LoginShell><Typography role="status">Cargando sesión...</Typography></LoginShell>;
    }
    if (authSession.status === "unauthorized") {
      return (
        <LoginShell>
          <Stack spacing={3}>
          <Typography variant="h4" component="h1" color="primary" textAlign="center">Acceso no autorizado</Typography>
          <Typography>Su cuenta no tiene un perfil habilitado para acceder.</Typography>
          <Button variant="contained" onClick={() => void signOutCurrentUser()}>Cerrar sesión</Button>
          </Stack>
        </LoginShell>
      );
    }
    return (
      <LoginShell>
        <Box
          component="form"
          sx={{ display: "grid", gap: 2.5 }}
          onSubmit={async (event) => {
            event.preventDefault();
            setLoginError(null);
            setIsSigningIn(true);
            try {
              await signInWithUsername(username, password);
              setPassword("");
            } catch {
              setLoginError("No pudimos iniciar sesión. Verifique su usuario y contraseña.");
            } finally {
              setIsSigningIn(false);
            }
          }}
        >
          <Stack spacing={0.75} textAlign="center" sx={{ mb: 1 }}>
            <Typography variant="h4" component="h1" color="primary">Iniciar sesión</Typography>
            <Typography color="text.secondary">Acceda con sus credenciales para continuar.</Typography>
          </Stack>
          <TextField label="Usuario" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required disabled={isSigningIn} />
          <TextField label="Contraseña" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={isSigningIn} />
          {loginError && <Alert severity="error">{loginError}</Alert>}
          <Box sx={{ display: "flex", justifyContent: "center", pt: 1 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={isSigningIn}
              sx={{ minHeight: 56, minWidth: { xs: "100%", sm: 220 }, px: 4, borderRadius: 1.5, fontSize: 18 }}
            >
              {isSigningIn ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
          </Box>
        </Box>
      </LoginShell>
    );
  }

  if (!publicSurfaceRole && authenticatedProfile && !hasAuthorizedCenter) {
    return <Page title="Centro no disponible"><Alert severity="warning">Su cuenta no tiene centros habilitados disponibles.</Alert></Page>;
  }

  const effectiveRole: Role = publicSurfaceRole ?? authenticatedProfile?.role ?? role;
  const operationalData: AppData = (() => {
    if (!remoteOperationalDay) return data;

    const currentSession = getCurrentSession(data);
    const remoteMetadata = remoteOperationalDay.metadata &&
      typeof remoteOperationalDay.metadata === "object"
      ? remoteOperationalDay.metadata as Partial<SessionMetadata>
      : null;
    const remoteCases = remoteOperationalDay.cases &&
      typeof remoteOperationalDay.cases === "object"
      ? remoteOperationalDay.cases as AppData["cases"]
      : {};
    const remotePaymentQueue = remoteOperationalDay.paymentQueue &&
      typeof remoteOperationalDay.paymentQueue === "object"
      ? remoteOperationalDay.paymentQueue as AppData["paymentQueue"]
      : {};
    const remoteEvents = Array.isArray(remoteOperationalDay.events)
      ? remoteOperationalDay.events as AppData["events"]
      : remoteOperationalDay.events && typeof remoteOperationalDay.events === "object"
        ? Object.values(remoteOperationalDay.events as Record<string, AppData["events"][number]>)
        : [];

    return {
      ...data,
      sessions: currentSession && remoteMetadata
        ? {
            ...data.sessions,
            [currentSession.sessionId]: { ...currentSession, ...remoteMetadata },
          }
        : data.sessions,
      cases: remoteCases,
      paymentQueue: remotePaymentQueue,
      events: remoteEvents,
    };
  })();
  const privateData = authenticatedProfile
    ? {
        ...operationalData,
        centers: Object.fromEntries(
          Object.entries(operationalData.centers).filter(([centerId]) =>
            authenticatedProfile.centerIds.includes(centerId),
          ),
        ),
      }
    : operationalData;

  const activeOperatorWindow = effectiveRole.startsWith("operator")
    ? windowForRole(getCurrentCenter(privateData), effectiveRole)
    : null;

  return (
    <>
      <Header role={effectiveRole} data={privateData} setRole={setRole} setData={setData} allowedCenterIds={authenticatedProfile?.centerIds} onLogout={authenticatedProfile ? () => void signOutCurrentUser() : undefined} />
      {effectiveRole === "kiosk" && <KioskView centerId={data.selectedCenterId} />}
      {effectiveRole.startsWith("operator") && activeOperatorWindow && (
        <OperatorView operatorWindow={activeOperatorWindow} role={effectiveRole} data={privateData} setData={setData} />
      )}
      {effectiveRole.startsWith("operator") && !activeOperatorWindow && (
        <Page title="Ventanilla no disponible">
          <Alert severity="warning">Esta ventanilla no está configurada para el centro seleccionado.</Alert>
        </Page>
      )}
      {effectiveRole === "cashier" && authenticatedProfile?.cashierId && <CashierView cashierId={authenticatedProfile.cashierId} data={privateData} setData={setData} />}
      {effectiveRole === "cashier" && !authenticatedProfile?.cashierId && <Page title="Caja no asignada"><Alert severity="warning">Su cuenta no tiene una caja asignada.</Alert></Page>}
      {effectiveRole === "display" && <DisplayView data={data} />}
      {effectiveRole === "admin" && <AdminView data={privateData} setData={setData} />}
      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={2400}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
      <Button
        aria-label="Reiniciar datos demo"
        variant="outlined"
        size="small"
        title="Reiniciar datos demo"
        startIcon={<Refresh />}
        onClick={() => {
          window.localStorage.removeItem("ccvi-control-atencion-demo-v2-3");
          window.location.reload();
        }}
        sx={{
          position: "fixed",
          right: { xs: 12, sm: 16 },
          bottom: { xs: 12, sm: 16 },
          zIndex: (theme) => theme.zIndex.snackbar - 1,
          minWidth: { xs: 48, sm: 143 },
          width: { xs: 48, sm: "auto" },
          px: { xs: 0, sm: 1.75 },
          bgcolor: "rgba(255,255,255,0.94)",
          borderColor: "rgba(17,27,50,0.32)",
          color: ccviPalette.navy,
          boxShadow: "0 8px 18px rgba(17, 27, 50, 0.10)",
          "& .MuiButton-startIcon": {
            mr: { xs: 0, sm: 0.75 },
            ml: 0,
          },
          "&:hover": {
            bgcolor: "#FFFFFF",
            borderColor: ccviPalette.navy,
            boxShadow: "0 10px 24px rgba(17, 27, 50, 0.16)",
          },
          display: effectiveRole === "admin" ? "inline-flex" : "none",
        }}
      >
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          Reiniciar demo
        </Box>
      </Button>
    </>
  );
};

export default App;
