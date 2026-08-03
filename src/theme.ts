import { createTheme } from "@mui/material/styles";

export const ccviBackgroundGradient =
  "linear-gradient(360deg, #f7f9fe 4%, #f5f5f5 49%, #f5f5f5 89%, #f8d188 99%)";

export const ccviPalette = {
  navy: "#111B32",
  petroleum: "#173D4F",
  orange: "#FF6B00",
  warmGray: "#918B91",
  background: "#E7EAF1",
  border: "#DDE2EA",
  text: "#111827",
  muted: "#5F6673",
  success: "#157347",
  warning: "#B7791F",
  error: "#B42318",
};

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: ccviPalette.navy,
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: ccviPalette.orange,
      contrastText: "#FFFFFF",
    },
    background: {
      default: ccviPalette.background,
      paper: "#FFFFFF",
    },
    text: {
      primary: ccviPalette.text,
      secondary: ccviPalette.muted,
    },
    success: {
      main: ccviPalette.success,
    },
    warning: {
      main: ccviPalette.warning,
    },
    error: {
      main: ccviPalette.error,
    },
  },
  typography: {
    fontFamily:
      "Inter, Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: {
      fontWeight: 800,
      letterSpacing: 0,
    },
    h2: {
      fontWeight: 800,
      letterSpacing: 0,
    },
    h3: {
      fontWeight: 800,
      letterSpacing: 0,
    },
    h4: {
      fontWeight: 800,
      letterSpacing: 0,
    },
    h5: {
      fontWeight: 750,
      letterSpacing: 0,
    },
    h6: {
      fontWeight: 750,
      letterSpacing: 0,
    },
    button: {
      fontWeight: 800,
      textTransform: "none",
      letterSpacing: 0,
    },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          minWidth: 320,
          minHeight: "100%",
          background: ccviBackgroundGradient,
          backgroundAttachment: "fixed",
        },
        body: {
          position: "relative",
          minWidth: 320,
          minHeight: "100vh",
          background: ccviBackgroundGradient,
          backgroundAttachment: "fixed",
          overflowX: "hidden",
        },
        "body::after": {
          content: '""',
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          mixBlendMode: "overlay",
          opacity: 0.05,
          pointerEvents: "none",
        },
        "#root": {
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          isolation: "isolate",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 48,
          boxShadow: "none",
          transition:
            "background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 80ms ease",
          "&:hover": {
            boxShadow: "0 8px 18px rgba(17, 27, 50, 0.14)",
          },
          "&:active": {
            transform: "translateY(1px)",
            boxShadow: "none",
          },
          "&.Mui-focusVisible": {
            outline: `3px solid ${ccviPalette.orange}`,
            outlineOffset: 3,
          },
          "&.Mui-disabled": {
            opacity: 1,
            cursor: "not-allowed",
            boxShadow: "none",
            backgroundColor: "#E3E7EF",
            borderColor: "#CBD5E1",
            color: "#64748B",
          },
        },
        containedPrimary: {
          "&:active": {
            backgroundColor: "#0A1224",
          },
        },
        containedSecondary: {
          "&:active": {
            backgroundColor: "#D95700",
          },
        },
        outlined: {
          borderWidth: 1.5,
          "&:hover": {
            borderWidth: 1.5,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${ccviPalette.border}`,
          boxShadow: "0 12px 28px rgba(17, 27, 50, 0.08)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 750,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: ccviPalette.orange,
            borderWidth: 2,
          },
        },
      },
    },
  },
});
