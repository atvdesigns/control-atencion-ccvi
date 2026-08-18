import type { CaseRecord, CaseState } from "./types";

export const PUBLIC_JOURNEY_STEPS = [
  "Guarde su número",
  "Prepare su documentación",
  "Atención en ventanilla",
  "Espere el llamado a caja",
  "Realice el pago",
] as const;

export const PUBLIC_JOURNEY_STEP_BY_STATE: Record<CaseState, number> = {
  arrived: 0,
  waiting_document_validation: 1,
  called_to_window: 2,
  in_document_validation: 2,
  documentation_incomplete: 2,
  rejected: 2,
  no_show: 2,
  cancelled: 2,
  approved_for_cashier: 3,
  waiting_cashier: 3,
  called_to_cashier: 4,
  in_cashier_attention: 4,
  paused: 4,
  payment_completed: 5,
  completed: 5,
};

export const getPublicJourneyStep = (state: CaseState) =>
  PUBLIC_JOURNEY_STEP_BY_STATE[state];

export const isVisiblePublicCode = (publicCode: string) => {
  const match = /^V([1-9]\d*)-(\d+)$/.exec(publicCode);
  return Boolean(match && Number(match[2]) >= 1);
};

export interface PublicJourneyPresentation {
  title: string;
  description: string;
  destination: string | null;
  isExceptional: boolean;
}

export const getPublicJourneyPresentation = (
  caseItem: CaseRecord,
  cashierDestination: string | null = null,
): PublicJourneyPresentation => {
  const windowDestination = `Ventanilla ${caseItem.assignedWindowNumber}`;

  switch (caseItem.currentState) {
    case "arrived":
      return {
        title: "Guarde su número",
        description:
          "Tome una fotografía de esta pantalla o conserve esta página para consultar su atención.",
        destination: windowDestination,
        isExceptional: false,
      };
    case "waiting_document_validation":
      return {
        title: "Prepare su documentación",
        description: "Mantenga sus documentos disponibles mientras espera el llamado.",
        destination: windowDestination,
        isExceptional: false,
      };
    case "called_to_window":
      return {
        title: `Diríjase a ${windowDestination}`,
        description: "Su número fue llamado. Preséntese en la ventanilla indicada.",
        destination: windowDestination,
        isExceptional: false,
      };
    case "in_document_validation":
      return {
        title: "Atención en ventanilla",
        description: "El personal está revisando su documentación.",
        destination: windowDestination,
        isExceptional: false,
      };
    case "documentation_incomplete":
      return {
        title: "El trámite no puede continuar por ahora",
        description:
          "La documentación presentada está incompleta. Consulte en la ventanilla qué necesita para continuar.",
        destination: windowDestination,
        isExceptional: true,
      };
    case "rejected":
      return {
        title: "El trámite no puede continuar",
        description:
          "El trámite no fue aprobado. Consulte en la ventanilla las alternativas disponibles para su caso.",
        destination: windowDestination,
        isExceptional: true,
      };
    case "approved_for_cashier":
    case "waiting_cashier":
      return {
        title: "Espere el llamado a caja",
        description:
          "Después de aprobar su documentación, vuelva al área de espera. Mantenga preparado su medio de pago. El monitor le indicará a qué caja debe dirigirse.",
        destination: null,
        isExceptional: false,
      };
    case "called_to_cashier":
      return {
        title: cashierDestination ? `Diríjase a ${cashierDestination}` : "Diríjase a caja",
        description: "Su número fue llamado para continuar con el pago.",
        destination: cashierDestination,
        isExceptional: false,
      };
    case "in_cashier_attention":
      return {
        title: "Atención en caja",
        description: "Complete el pago siguiendo las indicaciones del personal.",
        destination: cashierDestination,
        isExceptional: false,
      };
    case "paused":
      return {
        title: "Pago pendiente",
        description: "Consulte en caja cómo retomar la atención cuando pueda continuar.",
        destination: cashierDestination,
        isExceptional: true,
      };
    case "payment_completed":
    case "completed":
      return {
        title: "Trámite finalizado",
        description: "El pago fue registrado y su atención ha finalizado.",
        destination: cashierDestination,
        isExceptional: false,
      };
    case "no_show":
      return {
        title: "No se registró su presentación",
        description:
          "No fue posible confirmar su presentación cuando se llamó su número. Consulte al personal del centro para saber cómo continuar.",
        destination: windowDestination,
        isExceptional: true,
      };
    case "cancelled":
      return {
        title: "Turno cancelado",
        description: "Consulte al personal del centro si necesita solicitar una nueva atención.",
        destination: null,
        isExceptional: true,
      };
  }
};
