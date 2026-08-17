import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import type {
  DocumentaryRequirement,
  DocumentaryRequirementsByService,
  PaymentMethodConfig,
  ServiceType,
} from "../types";

interface CenterJourneyConfigFieldsProps {
  requirements: DocumentaryRequirementsByService;
  paymentMethods: PaymentMethodConfig[];
  onRequirementsChange: (requirements: DocumentaryRequirementsByService) => void;
  onPaymentMethodsChange: (methods: PaymentMethodConfig[]) => void;
}

const SERVICE_LABELS: Record<ServiceType, string> = {
  representation: "Representación, empresa o poder notarial",
  vehicle_owner: "Propietario del vehículo retenido",
};

const createId = (prefix: string) => {
  if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return `${prefix}-${Array.from(values, (value) => value.toString(16)).join("")}`;
};

export const CenterJourneyConfigFields = ({
  requirements,
  paymentMethods,
  onRequirementsChange,
  onPaymentMethodsChange,
}: CenterJourneyConfigFieldsProps) => {
  const updateRequirement = (
    serviceType: ServiceType,
    requirementId: string,
    patch: Partial<DocumentaryRequirement>,
  ) => {
    onRequirementsChange({
      ...requirements,
      [serviceType]: requirements[serviceType].map((requirement) =>
        requirement.requirementId === requirementId
          ? { ...requirement, ...patch }
          : requirement,
      ),
    });
  };

  const removeRequirement = (serviceType: ServiceType, requirementId: string) => {
    onRequirementsChange({
      ...requirements,
      [serviceType]: requirements[serviceType].filter(
        (requirement) => requirement.requirementId !== requirementId,
      ),
    });
  };

  const addRequirement = (serviceType: ServiceType) => {
    onRequirementsChange({
      ...requirements,
      [serviceType]: [
        ...requirements[serviceType],
        {
          requirementId: createId(`${serviceType}-requirement`),
          label: "",
          enabled: true,
        },
      ],
    });
  };

  return (
    <Stack spacing={2} mt={3}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <FactCheckOutlined color="primary" aria-hidden="true" />
          <Typography variant="h6" fontWeight={800}>
            Requisitos documentales
          </Typography>
        </Stack>
        <Typography color="text.secondary">
          Defina la información que verá la persona según el tipo de atención.
        </Typography>
      </Box>

      {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((serviceType) => (
        <Accordion key={serviceType} variant="outlined" disableGutters>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography fontWeight={700}>{SERVICE_LABELS[serviceType]}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {requirements[serviceType].map((requirement, index) => (
                <Stack
                  key={requirement.requirementId}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ sm: "center" }}
                >
                  <TextField
                    fullWidth
                    label={`Requisito ${index + 1}`}
                    value={requirement.label}
                    onChange={(event) =>
                      updateRequirement(serviceType, requirement.requirementId, {
                        label: event.target.value,
                      })
                    }
                    inputProps={{ maxLength: 160 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={requirement.enabled}
                        onChange={(event) =>
                          updateRequirement(serviceType, requirement.requirementId, {
                            enabled: event.target.checked,
                          })
                        }
                        inputProps={{
                          "aria-label": `${requirement.enabled ? "Desactivar" : "Activar"} requisito ${index + 1}`,
                        }}
                      />
                    }
                    label="Visible"
                  />
                  <IconButton
                    aria-label={`Eliminar requisito ${index + 1}`}
                    onClick={() => removeRequirement(serviceType, requirement.requirementId)}
                    sx={{ minWidth: 48, minHeight: 48 }}
                  >
                    <DeleteOutline />
                  </IconButton>
                </Stack>
              ))}
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => addRequirement(serviceType)}
                sx={{ alignSelf: "flex-start", minHeight: 48 }}
              >
                Agregar requisito
              </Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}

      <Box pt={1}>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <PaymentsOutlined color="primary" aria-hidden="true" />
          <Typography variant="h6" fontWeight={800}>
            Medios de pago
          </Typography>
        </Stack>
        <Typography color="text.secondary">
          Indique qué medios acepta este centro. Los no aceptados también se informarán claramente.
        </Typography>
      </Box>

      <Stack spacing={2}>
        {paymentMethods.map((method, index) => (
          <Stack
            key={method.paymentMethodId}
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ sm: "center" }}
          >
            <TextField
              fullWidth
              label={`Medio de pago ${index + 1}`}
              value={method.label}
              onChange={(event) =>
                onPaymentMethodsChange(
                  paymentMethods.map((item) =>
                    item.paymentMethodId === method.paymentMethodId
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                )
              }
              inputProps={{ maxLength: 80 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={method.accepted}
                  onChange={(event) =>
                    onPaymentMethodsChange(
                      paymentMethods.map((item) =>
                        item.paymentMethodId === method.paymentMethodId
                          ? { ...item, accepted: event.target.checked }
                          : item,
                      ),
                    )
                  }
                  inputProps={{
                    "aria-label": `${method.accepted ? "Marcar como no aceptado" : "Marcar como aceptado"}: ${method.label || `medio ${index + 1}`}`,
                  }}
                />
              }
              label={method.accepted ? "Aceptado" : "No aceptado"}
            />
            <IconButton
              aria-label={`Eliminar medio de pago ${index + 1}`}
              onClick={() =>
                onPaymentMethodsChange(
                  paymentMethods.filter(
                    (item) => item.paymentMethodId !== method.paymentMethodId,
                  ),
                )
              }
              sx={{ minWidth: 48, minHeight: 48 }}
            >
              <DeleteOutline />
            </IconButton>
          </Stack>
        ))}
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={() =>
            onPaymentMethodsChange([
              ...paymentMethods,
              {
                paymentMethodId: createId("payment-method"),
                label: "",
                accepted: true,
              },
            ])
          }
          sx={{ alignSelf: "flex-start", minHeight: 48 }}
        >
          Agregar medio de pago
        </Button>
      </Stack>
    </Stack>
  );
};
