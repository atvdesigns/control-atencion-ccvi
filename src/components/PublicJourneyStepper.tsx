import {
  Box,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { PUBLIC_JOURNEY_STEPS } from "../publicJourney";

interface PublicJourneyStepperProps {
  activeStep: number;
}

export const PublicJourneyStepper = ({ activeStep }: PublicJourneyStepperProps) => {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("sm"));
  const boundedStep = Math.min(Math.max(activeStep, 0), PUBLIC_JOURNEY_STEPS.length);
  const isComplete = boundedStep === PUBLIC_JOURNEY_STEPS.length;

  return (
    <Box component="section" aria-labelledby="public-journey-title">
      <Typography id="public-journey-title" variant="h6" fontWeight={800} mb={2}>
        Estado de su atención
      </Typography>
      <Typography color="text.secondary" mb={2}>
        {isComplete
          ? "Los cinco pasos de su atención están completos."
          : `Paso ${boundedStep + 1} de ${PUBLIC_JOURNEY_STEPS.length}: ${PUBLIC_JOURNEY_STEPS[boundedStep]}.`}
      </Typography>
      <Stepper
        activeStep={boundedStep}
        orientation={isCompact ? "vertical" : "horizontal"}
        alternativeLabel={!isCompact}
        aria-label="Progreso de su atención"
      >
        {PUBLIC_JOURNEY_STEPS.map((label, index) => (
          <Step key={label} completed={isComplete || index < boundedStep}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};
