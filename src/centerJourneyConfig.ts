import type {
  DocumentaryRequirement,
  DocumentaryRequirementsByService,
  PaymentMethodConfig,
  ServiceType,
} from "./types";

const DEFAULT_REQUIREMENTS: DocumentaryRequirementsByService = {
  "representation": [
    {
      "requirementId": "representation-valid-powers",
      "label": "Poder notarial vigente y/o Certificado de Vigencia de Poderes con máximo 60 días de antigüedad.",
      "enabled": true
    },
    {
      "requirementId": "representation-legal-representative-identity",
      "label": "Cédula de Identidad vigente.",
      "enabled": true
    },
    {
      "requirementId": "representation-return-order",
      "label": "Oficio de devolución (Orden de liberación).",
      "enabled": true
    },
    {
      "requirementId": "representation-current-annotations",
      "label": "Certificado de Anotaciones Vigentes (CAV) del vehículo, con una antigüedad máxima de 30 días desde su fecha de emisión.",
      "enabled": true
    },
    {
      "requirementId": "representation-company-statutes",
      "label": "Copia de la Escritura de Constitución de la sociedad.",
      "enabled": true
    },
    {
      "requirementId": "representation-vehicle-documents",
      "label": "Permiso de circulación, SOAP y Revisión Técnica.",
      "enabled": true
    }
  ],
  "vehicle_owner": [
    {
      "requirementId": "owner-return-order",
      "label": "Oficio de Devolución (Orden de liberación) del Juzgado de Policía Local.",
      "enabled": true
    },
    {
      "requirementId": "owner-current-identity",
      "label": "Cédula de Identidad vigente.",
      "enabled": true
    },
    {
      "requirementId": "owner-current-annotations",
      "label": "Certificado de Anotaciones Vigentes o padrón emitido no más de 30 días.",
      "enabled": true
    },
    {
      "requirementId": "owner-vehicle-documents",
      "label": "Permiso de circulación, SOAP y Revisión Técnica.",
      "enabled": true
    }
  ]
};

const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  { paymentMethodId: "bank-transfer", label: "Transferencia", accepted: true },
  { paymentMethodId: "cash", label: "Efectivo", accepted: true },
  { paymentMethodId: "debit-card", label: "Tarjeta de débito", accepted: true },
  { paymentMethodId: "credit-card", label: "Tarjeta de crédito", accepted: true },
  { paymentMethodId: "cheque", label: "Cheque", accepted: false },
];

const cloneRequirements = (requirements: DocumentaryRequirement[]) =>
  requirements.map((requirement) => ({ ...requirement }));

export const createDefaultDocumentaryRequirements = (): DocumentaryRequirementsByService => ({
  representation: cloneRequirements(DEFAULT_REQUIREMENTS.representation),
  vehicle_owner: cloneRequirements(DEFAULT_REQUIREMENTS.vehicle_owner),
});

export const createDefaultPaymentMethods = (): PaymentMethodConfig[] =>
  DEFAULT_PAYMENT_METHODS.map((method) => ({ ...method }));

const normalizeRequirementList = (
  serviceType: ServiceType,
  requirements: DocumentaryRequirement[] | undefined,
) => {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return cloneRequirements(DEFAULT_REQUIREMENTS[serviceType]);
  }

  return requirements
    .filter((requirement) => requirement && typeof requirement.label === "string")
    .map((requirement, index) => ({
      requirementId:
        requirement.requirementId || `${serviceType}-requirement-${index + 1}`,
      label: requirement.label.trim(),
      enabled: requirement.enabled !== false,
    }))
    .filter((requirement) => requirement.label.length > 0);
};

export const normalizeDocumentaryRequirements = (
  requirements?: Partial<DocumentaryRequirementsByService>,
): DocumentaryRequirementsByService => ({
  representation: normalizeRequirementList("representation", requirements?.representation),
  vehicle_owner: normalizeRequirementList("vehicle_owner", requirements?.vehicle_owner),
});

export const normalizePaymentMethods = (
  methods?: PaymentMethodConfig[],
): PaymentMethodConfig[] => {
  if (!Array.isArray(methods) || methods.length === 0) return createDefaultPaymentMethods();

  return methods
    .filter((method) => method && typeof method.label === "string")
    .map((method, index) => ({
      paymentMethodId: method.paymentMethodId || `payment-method-${index + 1}`,
      label: method.label.trim(),
      accepted: method.accepted === true,
    }))
    .filter((method) => method.label.length > 0);
};
