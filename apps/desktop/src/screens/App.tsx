import React, { useState, useCallback } from "react";
import { Layout, type ScreenId } from "../components/Layout";
import { DashboardScreen } from "./Dashboard";
import { OnboardingScreen } from "./Onboarding";
import { AssetDetailScreen } from "./AssetDetail";
import { OptionsExplorerScreen } from "./OptionsExplorer";
import { PortfolioScreen } from "./Portfolio";
import { SettingsScreen } from "./Settings";

export const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>("dashboard");
  const [onboardingComplete, setOnboardingComplete] = useState(true);

  const handleNavigate = useCallback((screen: ScreenId) => {
    setCurrentScreen(screen);
  }, []);

  if (!onboardingComplete) {
    return (
      <OnboardingScreen
        onComplete={() => {
          setOnboardingComplete(true);
        }}
      />
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case "dashboard":
        return <DashboardScreen />;
      case "onboarding":
        return (
          <OnboardingScreen
            onComplete={() => {
              setOnboardingComplete(true);
              setCurrentScreen("dashboard");
            }}
          />
        );
      case "asset":
        return <AssetDetailScreen />;
      case "options":
        return <OptionsExplorerScreen />;
      case "portfolio":
        return <PortfolioScreen />;
      case "settings":
        return <SettingsScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <Layout currentScreen={currentScreen} onNavigate={handleNavigate}>
      {renderScreen()}
    </Layout>
  );
};
