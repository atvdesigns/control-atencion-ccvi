import {
  Alert,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import type { DocumentaryRequirement, PaymentMethodConfig } from "../types";

interface PublicJourneyInformationProps {
  requirements: DocumentaryRequirement[];
  paymentMethods: PaymentMethodConfig[];
}

export const PublicJourneyInformation = ({
  requirements,
  paymentMethods,
}: PublicJourneyInformationProps) => {
  const enabledRequirements = requirements.filter((requirement) => requirement.enabled);
  const acceptedMethods = paymentMethods.filter((method) => method.accepted);
  const unavailableMethods = paymentMethods.filter((method) => !method.accepted);

  return (
    <Stack
      component="section"
      aria-label="Información para preparar su atención"
      direction={{ xs: "column", md: "row" }}
      spacing={2}
    >
      <Box component="section" aria-labelledby="public-requirements-title" sx={{ flex: 1 }}>
        <Typography variant="h6" fontWeight={800}>
          <span id="public-requirements-title">Documentación que debe preparar</span>
        </Typography>
        <Typography color="text.secondary" mt={0.5}>
          Mantenga estos documentos disponibles antes de que llamen su número.
        </Typography>
        <List disablePadding sx={{ mt: 1 }}>
          {enabledRequirements.map((requirement) => (
            <ListItem key={requirement.requirementId} disableGutters alignItems="flex-start">
              <ListItemIcon sx={{ minWidth: 36, color: "success.main", mt: 0.25 }}>
                <CheckCircleOutline aria-hidden="true" />
              </ListItemIcon>
              <ListItemText primary={requirement.label} />
            </ListItem>
          ))}
        </List>
      </Box>

      <Box component="section" aria-labelledby="public-payment-title" sx={{ flex: 1 }}>
        <Typography variant="h6" fontWeight={800}>
          <span id="public-payment-title">Medios de pago</span>
        </Typography>
        <Typography color="text.secondary" mt={0.5}>
          En caja podrá pagar con los siguientes medios aceptados por este centro.
        </Typography>
        <List disablePadding sx={{ mt: 1 }}>
          {acceptedMethods.map((method) => (
            <ListItem key={method.paymentMethodId} disableGutters>
              <ListItemIcon sx={{ minWidth: 36, color: "success.main" }}>
                <CheckCircleOutline aria-hidden="true" />
              </ListItemIcon>
              <ListItemText primary={method.label} />
            </ListItem>
          ))}
        </List>
        {unavailableMethods.length > 0 && (
          <Alert icon={<WarningAmberOutlined fontSize="inherit" />} severity="info" sx={{ mt: 1 }}>
            No se acepta: {unavailableMethods.map((method) => method.label).join(", ")}.
          </Alert>
        )}
      </Box>
    </Stack>
  );
};
