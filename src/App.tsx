import {
  AccountBalance,
  AddBusiness,
  AssignmentTurnedIn,
  Badge,
  Campaign,
  CheckCircle,
  Dashboard,
  Description,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { PublicJourneyStepper } from "./components/PublicJourneyStepper";
import { PublicJourneyInformation } from "./components/PublicJourneyInformation";
import {
  getPublicJourneyPresentation,
  getPublicJourneyStep,
  isVisiblePublicCode,
} from "./publicJourney";
import type { AppData, CaseRecord, CenterConfig, Metrics, PriorityType, Role, ServiceType, SessionMetadata } from "./types";
import { ccviBackgroundGradient, ccviPalette } from "./theme";
import {
  calculateMetrics,
  callNextForCashier,
  callNextForOperator,
  completePayment,
  createArrival,
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
  markWindowNoShow,
  markCaseAsPriority,
  removeCasePriority,
  markNoShow,
  pausePayment,
  reassignCase,
  resumePausedPayment,
  roleLabels,
  saveData,
  updateCasePriority,
  selectCenter,
  serviceLabels,
  startCashierAttention,
  startValidation,
  stateLabels,
  finishDocumentValidation,
  updateCenter,
  windowForRole,
} from "./store";
import { hasFirebaseConfig } from "./services/firebase";

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

const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

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
  const raw = new URLSearchParams(window.location.search).get("role");
  return roleOptions.includes(raw as Role)
    ? (raw as Role)
    : ((window.localStorage.getItem("ccvi-role") as Role | null) ?? "kiosk");
};

const Header = ({
  role,
  data,
  setRole,
  setData,
}: {
  role: Role;
  data: AppData;
  setRole: (role: Role) => void;
  setData: (updater: (data: AppData) => AppData) => void;
}) => {
  const center = getCurrentCenter(data);

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
            Control de Atención CCVI
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.82 }}>
            {center.name} · Gestión paperless y cola de caja en tiempo real
          </Typography>
        </Box>
        <Chip label={hasFirebaseConfig ? "Firebase listo" : "Demo local"} color="secondary" />
        <HeaderSelect label="Rol" minWidth={220}>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            displayEmpty
            inputProps={{ "aria-label": "Seleccionar rol de la aplicación" }}
          >
            {roleOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {roleLabels[option]}
              </MenuItem>
            ))}
          </Select>
        </HeaderSelect>
        <HeaderSelect label="Centro" minWidth={280}>
          <Select
            value={data.selectedCenterId}
            onChange={(event) => setData((current) => selectCenter(current, event.target.value))}
            displayEmpty
            inputProps={{ "aria-label": "Seleccionar centro de atención" }}
          >
            {Object.values(data.centers).map((centerOption) => (
              <MenuItem key={centerOption.centerId} value={centerOption.centerId}>
                {centerOption.name}
              </MenuItem>
            ))}
          </Select>
        </HeaderSelect>
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

const numericSuffix = (value: string | null | undefined) => {
  const match = value?.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const displayWindowTones = [
  { background: "#147EA3", border: "#8FD4E8", shadow: "rgba(20, 126, 163, 0.22)" },
  { background: "#9A642E", border: "#D7A46F", shadow: "rgba(154, 100, 46, 0.24)" },
  { background: "#C45A0A", border: "#FFB27A", shadow: "rgba(196, 90, 10, 0.22)" },
  { background: "#173D4F", border: "#8FD4E8", shadow: "rgba(23, 61, 79, 0.24)" },
  { background: "#4F5D75", border: "#BAC5D8", shadow: "rgba(79, 93, 117, 0.22)" },
  { background: "#5C4B7D", border: "#C9BCE8", shadow: "rgba(92, 75, 125, 0.22)" },
  { background: "#27705D", border: "#9DD4C3", shadow: "rgba(39, 112, 93, 0.22)" },
  { background: "#7A5A17", border: "#DEC271", shadow: "rgba(122, 90, 23, 0.22)" },
];

const displayCashierTones = [
  { background: "#102B63", border: "#AFC7F6", shadow: "rgba(16, 43, 99, 0.24)" },
  { background: "#123C7A", border: "#A7C7F2", shadow: "rgba(18, 60, 122, 0.24)" },
  { background: "#0F4C81", border: "#9FD3F2", shadow: "rgba(15, 76, 129, 0.24)" },
  { background: "#173D4F", border: "#8FD4E8", shadow: "rgba(23, 61, 79, 0.24)" },
  { background: "#111B32", border: "#B8C3D9", shadow: "rgba(17, 27, 50, 0.24)" },
  { background: "#1E3A8A", border: "#B7C9F5", shadow: "rgba(30, 58, 138, 0.24)" },
  { background: "#075985", border: "#9BD6F7", shadow: "rgba(7, 89, 133, 0.24)" },
  { background: "#164E63", border: "#99D5E8", shadow: "rgba(22, 78, 99, 0.24)" },
];

const displayToneFor = (caseItem: CaseRecord, mode: "window" | "cashier", center: CenterConfig) => {
  if (mode === "cashier") {
    const cashierIndex = Math.max(numericSuffix(caseItem.cashierId), 1) - 1;
    const tone = displayCashierTones[cashierIndex % displayCashierTones.length];

    return {
      ...tone,
      text: "#FFFFFF",
      muted: "rgba(255,255,255,0.78)",
    };
  }

  const configuredIndex = center.windows.findIndex(
    (windowItem) => windowItem.windowId === caseItem.assignedWindowId,
  );
  const fallbackIndex = Math.max(publicCodeWindowNumber(caseItem.publicCode), 1) - 1;
  const toneIndex = configuredIndex >= 0 ? configuredIndex : fallbackIndex;
  const tone = displayWindowTones[toneIndex % displayWindowTones.length];

  return {
    ...tone,
    text: "#FFFFFF",
    muted: "rgba(255,255,255,0.82)",
  };
};

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

const KioskView = ({
  data,
  setData,
}: {
  data: AppData;
  setData: (updater: (data: AppData) => AppData) => void;
}) => {
  const center = getCurrentCenter(data);
  const [lastCase, setLastCase] = useState<CaseRecord | null>(null);
  const [pendingService, setPendingService] = useState<ServiceType | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(center.kioskTimeoutSeconds);
  const creatingTicketRef = useRef(false);
  const centerIsOpen = isCenterOpenForTickets(center);
  const pendingWindow = pendingService
    ? center.windows
        .filter((item) => item.enabled && item.serviceType === pendingService)
        .sort((a, b) => a.displayOrder - b.displayOrder)[0]
    : undefined;

  const createTicket = (serviceType: ServiceType) => {
    if (creatingTicketRef.current) return;
    creatingTicketRef.current = true;

    setData((current) => {
      const currentCenter = getCurrentCenter(current);
      if (!isCenterOpenForTickets(currentCenter)) {
        setPendingService(null);
        creatingTicketRef.current = false;
        return current;
      }

      const previousCaseCount = Object.keys(current.cases).length;
      const next = createArrival(current, serviceType);
      if (Object.keys(next.cases).length === previousCaseCount) {
        creatingTicketRef.current = false;
        return next;
      }

      const created = Object.values(next.cases).sort((a, b) => b.arrivalAt - a.arrivalAt)[0];
      setLastCase(created);
      setRemainingSeconds(currentCenter.kioskTimeoutSeconds);
      setPendingService(null);
      window.setTimeout(() => {
        creatingTicketRef.current = false;
      }, 0);
      return next;
    });
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

  if (lastCase) {
    const windowItem = center.windows.find((item) => item.windowId === lastCase.assignedWindowId);
    const progress = center.kioskTimeoutSeconds
      ? (remainingSeconds / center.kioskTimeoutSeconds) * 100
      : 0;

    return (
      <CenteredShell>
        <Card sx={{ width: "min(720px, 100%)" }}>
          <CardContent>
            <Stack spacing={4} alignItems="center" textAlign="center">
              <Box role="status" aria-live="polite" aria-atomic="true">
                <Typography variant="h6" color="text.secondary">
                  Su número de atención es
                </Typography>
                <Typography
                  variant="h1"
                  aria-label={getAccessiblePublicCode(lastCase.publicCode)}
                  sx={{
                    mt: 1,
                    color: ccviPalette.navy,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: { xs: "4rem", md: "6.5rem" },
                  }}
                >
                  {lastCase.publicCode}
                </Typography>
              </Box>
              <Typography variant="h5" component="p" fontWeight={700}>
                {lastCase.serviceLabel}
              </Typography>
              <Alert severity="info" icon={<Storefront />} sx={{ width: "100%", textAlign: "left" }}>
                <Typography variant="h6" component="p" fontWeight={700}>
                  Pase a Ventanilla {windowItem?.windowNumber ?? lastCase.assignedWindowNumber}
                </Typography>
                <Typography component="p">
                  Guarde este número. Lo necesitará durante todo el proceso.
                </Typography>
              </Alert>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="center">
                <QRCodeSVG
                  value={getPublicStatusUrl(lastCase.publicToken)}
                  size={148}
                  title={`Código QR del número de atención ${lastCase.publicCode}`}
                />
                <Box textAlign={{ xs: "center", sm: "left" }}>
                  <Typography variant="h6">Guarde su número de atención</Typography>
                  <Typography color="text.secondary">
                    Tome una fotografía de esta pantalla o escanee el código QR.
                  </Typography>
                  <Typography color="text.secondary">
                    En esta página podrá consultar su número, la ventanilla asignada y, posteriormente, la caja a la
                    que deberá dirigirse.
                  </Typography>
                </Box>
              </Stack>
              <Box sx={{ width: "100%" }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Esta pantalla volverá al inicio en {remainingSeconds} segundos.
                </Typography>
                <LinearProgress variant="determinate" value={progress} sx={{ width: "100%" }} />
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button variant="outlined" onClick={() => setRemainingSeconds(center.kioskTimeoutSeconds)}>
                  Necesito más tiempo
                </Button>
                <Button variant="contained" onClick={() => setLastCase(null)}>
                  Finalizar
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </CenteredShell>
    );
  }

  return (
    <CenteredShell>
      <Stack spacing={4} textAlign="center" width="min(920px, 100%)">
        <Stack alignItems="center">
          <AppLogo size={112} />
        </Stack>
        <Box>
          <Typography
            variant="h2"
            sx={{
              color: ccviPalette.navy,
              fontSize: { xs: "2.35rem", sm: "3.25rem", md: "4.5rem" },
              lineHeight: 1.08,
            }}
          >
            Bienvenido al Centro de Custodia de Vehículos Infractores
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
            ¿Qué tipo de atención necesita?
          </Typography>
        </Box>
        {!centerIsOpen && (
          <Alert severity="warning" sx={{ textAlign: "left" }}>
            La generación de turnos está disponible solo dentro del horario de atención del centro:{" "}
            <strong>{formatServiceHours(center)}</strong>. Las métricas de jornadas anteriores se conservan para consulta
            administrativa.
          </Alert>
        )}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              size="large"
              variant="contained"
              color="secondary"
              startIcon={<Gavel />}
              disabled={!centerIsOpen}
              onClick={() => setPendingService("representation")}
              sx={{ minHeight: 160, fontSize: 20, whiteSpace: "normal" }}
            >
              <Stack spacing={1}>
                <span>Representación, empresa o poder notarial</span>
                <Typography component="span" variant="body2">
                  Será atendido en Ventanilla 1.
                </Typography>
              </Stack>
            </Button>
          </Grid>
          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              size="large"
              variant="contained"
              startIcon={<Person />}
              disabled={!centerIsOpen}
              onClick={() => setPendingService("vehicle_owner")}
              sx={{ minHeight: 160, fontSize: 20, whiteSpace: "normal" }}
            >
              <Stack spacing={1}>
                <span>Propietario del vehículo retenido</span>
                <Typography component="span" variant="body2">
                  Será atendido en Ventanilla 2.
                </Typography>
              </Stack>
            </Button>
          </Grid>
        </Grid>
        <Alert severity="success" icon={<QrCode2 />}>
          Su número se mostrará en pantalla. Puede guardarlo con una fotografía o mediante el código QR.
        </Alert>
        <Dialog
          open={Boolean(pendingService)}
          onClose={() => setPendingService(null)}
          fullWidth
          maxWidth="sm"
          aria-labelledby="kiosk-confirmation-title"
          aria-describedby="kiosk-confirmation-description"
        >
          <DialogTitle id="kiosk-confirmation-title">Antes de continuar</DialogTitle>
          <DialogContent>
            {pendingService && (
              <Stack spacing={3} sx={{ pt: 1 }}>
                <Typography id="kiosk-confirmation-description" variant="h6" component="p" fontWeight={700}>
                  {serviceLabels[pendingService]}
                </Typography>
                <Box component="ol" sx={{ m: 0, pl: 3.5 }}>
                  <Box component="li" sx={{ mb: 2 }}>
                    <Typography variant="h6" component="h3" fontWeight={700}>
                      Guarde su número
                    </Typography>
                    <Typography color="text.secondary">
                      Saque su celular y tome una fotografía de la pantalla o escanee el código QR.
                    </Typography>
                    <Typography color="text.secondary">
                      Necesitará este número durante todo el proceso.
                    </Typography>
                  </Box>
                  <Box component="li" sx={{ mb: 2 }}>
                    <Typography variant="h6" component="h3" fontWeight={700}>
                      Pase al área de espera
                    </Typography>
                    <Typography color="text.secondary">
                      Su atención corresponde a Ventanilla {pendingWindow?.windowNumber ?? "sin asignar"}.
                    </Typography>
                  </Box>
                  <Box component="li">
                    <Typography variant="h6" component="h3" fontWeight={700}>
                      Espere el llamado
                    </Typography>
                    <Typography color="text.secondary">
                      Mire el monitor y mantenga su documentación preparada.
                    </Typography>
                  </Box>
                </Box>
                {pendingWindow ? (
                  <Alert severity="info" icon={<Storefront />}>
                    <Typography component="p" fontWeight={700}>
                      Será atendido en Ventanilla {pendingWindow.windowNumber}
                    </Typography>
                  </Alert>
                ) : (
                  <Alert severity="warning">
                    No hay una ventanilla disponible para este tipo de atención. Solicite ayuda al personal del centro.
                  </Alert>
                )}
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3, gap: 1.5, flexDirection: { xs: "column-reverse", sm: "row" } }}>
            <Button fullWidth={false} variant="outlined" onClick={() => setPendingService(null)}>
              Volver
            </Button>
            <Button
              variant="contained"
              disabled={!centerIsOpen || !pendingWindow || !pendingService}
              onClick={() => pendingService && createTicket(pendingService)}
            >
              Confirmar y obtener número
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </CenteredShell>
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
  const [priorityRemovalCase, setPriorityRemovalCase] = useState<CaseRecord | null>(null);
  const [selectedPriorityType, setSelectedPriorityType] = useState<PriorityType | "">("");
  const closePriorityDialog = () => {
    setPriorityDialogCase(null);
    setSelectedPriorityType("");
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
        <Card sx={{ bgcolor: ccviPalette.navy, color: "white", borderRadius: surfaceRadius }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h5">Próxima atención documental</Typography>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<PlayArrow />}
                onClick={() =>
                  setData((currentData) =>
                    callNextForOperator(currentData, operatorWindow.windowId, role),
                  )
                }
                disabled={Boolean(activeCase) || waitingCases.length === 0}
                sx={{ width: "100%" }}
              >
                Llamar siguiente turno
              </Button>
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
                {activeCase.isPriority && activeCase.priorityType ? (
                  <Stack spacing={1} alignItems="flex-start">
                    <Alert severity="info" sx={{ width: "100%" }}>
                      <strong>Atención preferencial:</strong>{" "}
                      {priorityTypeLabels[activeCase.priorityType]}
                    </Alert>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setPriorityDialogCase(activeCase);
                        setSelectedPriorityType(activeCase.priorityType ?? "");
                      }}
                    >
                      Gestionar atención preferencial
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setPriorityDialogCase(activeCase);
                      setSelectedPriorityType("");
                    }}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Crear atención preferencial
                  </Button>
                )}
                {activeCase.currentState === "called_to_window" && (
                  <Stack spacing={1.5}>
                    <Alert severity="info">
                      Este turno ya fue llamado. Espere a que la persona se presente para iniciar la revisión.
                    </Alert>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant="contained"
                        onClick={() =>
                          setData((currentData) => startValidation(currentData, activeCase.caseId, role))
                        }
                      >
                        Iniciar validación
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={() =>
                          setData((currentData) => markWindowNoShow(currentData, activeCase.caseId, role))
                        }
                      >
                        No se presentó
                      </Button>
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
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap" useFlexGap>
                      <Button
                        variant="contained"
                        color="success"
                        onClick={() =>
                          setData((currentData) =>
                            finishDocumentValidation(currentData, activeCase.caseId, "approved", role),
                          )
                        }
                      >
                        Confirmar aprobación
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={() =>
                          setData((currentData) =>
                            finishDocumentValidation(currentData, activeCase.caseId, "incomplete", role),
                          )
                        }
                      >
                        Documentación incompleta
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() =>
                          setData((currentData) =>
                            finishDocumentValidation(currentData, activeCase.caseId, "rejected", role),
                          )
                        }
                      >
                        Rechazar
                      </Button>
                      {otherWindows.map((windowItem) => (
                        <Button
                          key={windowItem.windowId}
                          variant="outlined"
                          onClick={() =>
                            setData((currentData) =>
                              reassignCase(currentData, activeCase.caseId, windowItem.windowId, role),
                            )
                          }
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
                          Reasignar a {windowItem.name}
                        </Button>
                      ))}
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
      <Dialog open={Boolean(priorityDialogCase)} onClose={closePriorityDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {priorityDialogCase?.isPriority ? "Atención preferencial" : "Crear atención preferencial"}
        </DialogTitle>
        <DialogContent>
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
              {priorityDialogCase?.isPriority
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
        </DialogContent>
        <DialogActions>
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
              !selectedPriorityType ||
              !priorityDialogCase ||
              (priorityDialogCase.isPriority &&
                priorityDialogCase.priorityType === selectedPriorityType)
            }
            onClick={() => {
              if (!priorityDialogCase || !selectedPriorityType) return;
              setData((currentData) =>
                priorityDialogCase.isPriority
                  ? updateCasePriority(
                      currentData,
                      priorityDialogCase.caseId,
                      selectedPriorityType,
                      role,
                    )
                  : markCaseAsPriority(
                      currentData,
                      priorityDialogCase.caseId,
                      selectedPriorityType,
                      role,
                    ),
              );
              closePriorityDialog();
            }}
          >
            {priorityDialogCase?.isPriority
              ? "Cambiar motivo"
              : "Crear atención preferencial"}
          </Button>
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
            onClick={() => {
              if (!priorityRemovalCase) return;
              setData((currentData) =>
                removeCasePriority(currentData, priorityRemovalCase.caseId, role),
              );
              setPriorityRemovalCase(null);
            }}
          >
            Quitar atención preferencial
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  );
};

const CashierView = ({
  role,
  data,
  setData,
}: {
  role: Role;
  data: AppData;
  setData: (updater: (data: AppData) => AppData) => void;
}) => {
  const center = getCurrentCenter(data);
  const cashierId = role;
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
      title={roleLabels[role]}
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
                  onClick={() => setData((currentData) => callNextForCashier(currentData, cashierId))}
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
                        onClick={() => setData((currentData) => startCashierAttention(currentData, active.queueItemId))}
                      >
                        Iniciar atención
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => setData((currentData) => markNoShow(currentData, active.queueItemId))}
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
                        onClick={() => setData((currentData) => completePayment(currentData, active.queueItemId))}
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
                          onClick={() =>
                            setData((currentData) => resumePausedPayment(currentData, item.queueItemId, cashierId))
                          }
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
        onConfirm={(note) => {
          if (!paymentIssue) return;
          setData((currentData) => pausePayment(currentData, paymentIssue.queueItemId, role, note));
          setPaymentIssue(null);
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
  const center = getCurrentCenter(data);
  const lastCallSignatureRef = useRef("");
  const windowCalls = Object.values(data.cases)
    .filter(
      (caseItem) =>
        caseItem.centerId === data.selectedCenterId &&
        ["called_to_window", "in_document_validation"].includes(caseItem.currentState),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 4);
  const cashierCalls = Object.values(data.cases)
    .filter(
      (caseItem) =>
        caseItem.centerId === data.selectedCenterId &&
        ["called_to_cashier", "in_cashier_attention"].includes(caseItem.currentState),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
  const callSignature = [...windowCalls, ...cashierCalls]
    .map((caseItem) => `${caseItem.caseId}:${caseItem.currentState}:${caseItem.updatedAt}`)
    .join("|");

  useEffect(() => {
    if (!callSignature) {
      lastCallSignatureRef.current = "";
      return;
    }

    if (lastCallSignatureRef.current && lastCallSignatureRef.current !== callSignature) {
      playDisplayCallSound();
    }

    lastCallSignatureRef.current = callSignature;
  }, [callSignature]);

  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 80px)",
        bgcolor: ccviPalette.navy,
        color: "white",
        p: { xs: 2, md: 5 },
      }}
    >
      <Stack spacing={4}>
        <Box textAlign="center">
          <Typography variant="h2" sx={{ fontSize: { xs: "2.4rem", sm: "3.4rem", md: "4.5rem" } }}>
            Ahora llamando
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.8 }}>
            Mantenga siempre su mismo código de atención durante todo el proceso.
          </Typography>
        </Box>
        <Grid container spacing={3} alignItems="stretch">
          <Grid item xs={12} md={6}>
            <DisplayPanel title="Ventanilla" cases={windowCalls} center={center} mode="window" />
          </Grid>
          <Grid item xs={12} md={6}>
            <DisplayPanel title="Caja" cases={cashierCalls} center={center} mode="cashier" />
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
};

const DisplayPanel = ({
  title,
  cases,
  center,
  mode,
}: {
  title: string;
  cases: CaseRecord[];
  center: CenterConfig;
  mode: "window" | "cashier";
}) => (
  <Card
    sx={{
      border: `1px solid ${ccviPalette.border}`,
      borderRadius: surfaceRadius,
      bgcolor: "rgba(255,255,255,0.96)",
      height: "100%",
      minHeight: { md: 520 },
      overflow: "hidden",
    }}
  >
    <CardContent sx={{ height: "100%" }}>
      <Typography variant="h4" color="primary" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Stack spacing={2} sx={{ height: "calc(100% - 56px)" }}>
        {cases.length === 0 && <Typography color="text.secondary">Sin llamados activos.</Typography>}
        {cases.map((caseItem) => {
          const destination =
            mode === "window"
              ? center.windows.find((item) => item.windowId === caseItem.assignedWindowId)?.name
              : caseItem.cashierId?.replace("cashier", "Caja ");
          const tone = displayToneFor(caseItem, mode, center);
          return (
            <Box
              key={caseItem.caseId}
              sx={{
                p: { xs: 2.25, md: 3 },
                borderRadius: surfaceRadius,
                bgcolor: tone.background,
                color: tone.text,
                border: `2px solid ${tone.border}`,
                boxShadow: `0 12px 28px ${tone.shadow}`,
              }}
            >
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={5}>
                  <Typography variant="h6" sx={{ color: tone.muted, lineHeight: 1 }}>
                    Usuario
                  </Typography>
                  <Typography
                    variant="h2"
                    aria-label={getAccessiblePublicTicketLabel(
                      caseItem.publicCode,
                      caseItem.isPriority,
                    )}
                    sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1 }}
                  >
                    {formatPublicTicketLabel(caseItem.publicCode, caseItem.isPriority)}
                  </Typography>
                </Grid>
                <Grid
                  item
                  xs={12}
                  sm={1}
                  sx={{
                    display: { xs: "none", sm: "grid" },
                    placeItems: "center",
                    fontSize: "2rem",
                    fontWeight: 900,
                  }}
                  aria-hidden="true"
                >
                  ▶
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="h6" sx={{ color: tone.muted, lineHeight: 1 }}>
                    Pase a
                  </Typography>
                  <Typography variant="h3" sx={{ lineHeight: 1.05 }}>
                    {destination}
                  </Typography>
                </Grid>
              </Grid>
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
        onCreate={(name, code, representationWindows, ownerWindows, cashiers, serviceStartTime, serviceEndTime, cashierCommissionRate) => {
          setData((current) =>
            createCenter(
              current,
              name,
              code,
              representationWindows,
              ownerWindows,
              cashiers,
              serviceStartTime,
              serviceEndTime,
              cashierCommissionRate,
            ),
          );
          setOpen(false);
        }}
      />
      {editingCenter && (
        <EditCenterDialog
          center={editingCenter}
          open={Boolean(editingCenter)}
          onClose={() => setEditingCenterId(null)}
          onSave={(patch) => {
            setData((current) =>
              updateCenter(current, editingCenter.centerId, {
                ...patch,
                documentaryRequirements: editingCenter.documentaryRequirements,
                paymentMethods: editingCenter.paymentMethods,
              }),
            );
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
          onConfirm={() => {
            setData((current) => deleteCenter(current, deletingCenter.centerId));
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

const PublicStatusView = ({ data, token }: { data: AppData; token: string }) => {
  const caseItem = Object.values(data.cases).find((item) => item.publicToken === token);
  const center = caseItem ? data.centers[caseItem.centerId] : undefined;
  const cashierNumber = caseItem?.cashierId?.match(/(\d+)$/)?.[1];
  const cashierName = caseItem?.cashierId
    ? center?.cashiers.find((cashier) => cashier.cashierId === caseItem.cashierId)?.name ??
      (cashierNumber ? `Caja ${cashierNumber}` : "Caja asignada")
    : null;
  const presentation = caseItem
    ? getPublicJourneyPresentation(caseItem, cashierName)
    : null;
  const hasVisiblePublicCode = caseItem
    ? isVisiblePublicCode(caseItem.publicCode)
    : false;
  const showRequirements = caseItem
    ? [
        "arrived",
        "waiting_document_validation",
        "called_to_window",
        "in_document_validation",
      ].includes(caseItem.currentState)
    : false;
  const showPaymentMethods = caseItem
    ? [
        "approved_for_cashier",
        "waiting_cashier",
        "called_to_cashier",
        "in_cashier_attention",
      ].includes(caseItem.currentState)
    : false;

  return (
    <CenteredShell>
      <Card sx={{ width: "min(760px, 100%)" }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, "&:last-child": { pb: { xs: 2.5, sm: 4 } } }}>
          {!caseItem || !presentation || !hasVisiblePublicCode ? (
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
                  aria-label={getAccessiblePublicCode(caseItem.publicCode)}
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {caseItem.publicCode}
                </Typography>
                <Typography color="text.secondary">{caseItem.serviceLabel}</Typography>
                <Typography variant="h5">{presentation.title}</Typography>
                {presentation.destination && (
                  <Typography color="text.secondary" fontWeight={700}>
                    {presentation.destination}
                  </Typography>
                )}
              </Stack>

              <Paper
                component="section"
                variant="outlined"
                aria-labelledby="current-public-instruction"
                sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: "#f7f9fc" }}
              >
                <Typography id="current-public-instruction" variant="h6" mb={1}>
                  Qué debe hacer ahora
                </Typography>
                <Typography color="text.secondary">{presentation.description}</Typography>
              </Paper>

              <Divider />
              {!presentation.isExceptional && (
                <PublicJourneyStepper activeStep={getPublicJourneyStep(caseItem.currentState)} />
              )}

              <PublicJourneyInformation
                requirements={center?.documentaryRequirements[caseItem.serviceType] ?? []}
                paymentMethods={center?.paymentMethods ?? []}
                showRequirements={showRequirements}
                showPaymentMethods={showPaymentMethods}
              />

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

const App = () => {
  const [data, setDataState] = useState<AppData>(() => loadData());
  const [role, setRoleState] = useState<Role>(() => getRoleFromUrl());
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const publicToken = useMemo(() => {
    const match = window.location.pathname.match(/^\/turno\/(.+)$/);
    return match?.[1] ?? null;
  }, []);

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
    const onStorage = (event: StorageEvent) => {
      if (event.key === "ccvi-control-atencion-demo-v2-3" && event.newValue) {
        setDataState(loadData());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (publicToken) {
    return <PublicStatusView data={data} token={publicToken} />;
  }

  const activeOperatorWindow = role.startsWith("operator")
    ? windowForRole(getCurrentCenter(data), role)
    : null;

  return (
    <>
      <Header role={role} data={data} setRole={setRole} setData={setData} />
      {role === "kiosk" && <KioskView data={data} setData={setData} />}
      {role.startsWith("operator") && activeOperatorWindow && (
        <OperatorView operatorWindow={activeOperatorWindow} role={role} data={data} setData={setData} />
      )}
      {role.startsWith("operator") && !activeOperatorWindow && (
        <Page title="Ventanilla no disponible">
          <Alert severity="warning">Esta ventanilla no está configurada para el centro seleccionado.</Alert>
        </Page>
      )}
      {role.startsWith("cashier") && <CashierView role={role} data={data} setData={setData} />}
      {role === "display" && <DisplayView data={data} />}
      {role === "admin" && <AdminView data={data} setData={setData} />}
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
          display: role === "admin" ? "inline-flex" : "none",
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
