import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthGate } from '@/features/auth/AuthGate';
import { AppShell } from '@/features/shell/AppShell';
import {
  HomeScreen,
  RecurringScreen,
  TransactionsScreen,
} from '@/features/shell/routes';
import { BreakdownScreen } from '@/features/home/HomeScreen';
import { AccountsScreen } from '@/features/accounts/AccountsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SmsAutomationScreen } from '@/features/sms/SmsAutomationScreen';
import { ReviewSmsScreen } from '@/features/sms/ReviewSmsScreen';
import { PlanScreen } from '@/features/plan/PlanScreen';
import { PlanEditScreen } from '@/features/plan/PlanEditScreen';
import { GuideScreen } from '@/features/plan/GuideScreen';
import { PlanImpactScreen } from '@/features/plan/PlanImpactScreen';
import { AdviceScreen } from '@/features/plan/AdviceScreen';
import { BudgetsScreen } from '@/features/plan/BudgetsScreen';
import { SavingsScreen } from '@/features/plan/SavingsScreen';
import { InvestScreen } from '@/features/invest/InvestScreen';
import { AssetTypeScreen } from '@/features/invest/AssetTypeScreen';
import { HoldingScreen } from '@/features/invest/HoldingScreen';
import { NewsScreen } from '@/features/news/NewsScreen';
import { BriefScreen } from '@/features/news/BriefScreen';
import { Screen } from '@/features/shell/Screen';

export default function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/breakdown" element={<BreakdownScreen />} />
            <Route path="/transactions" element={<TransactionsScreen />} />
            <Route path="/recurring" element={<RecurringScreen />} />
            <Route path="/plan" element={<PlanScreen />} />
            <Route path="/plan/new" element={<PlanEditScreen />} />
            <Route path="/plan/:id" element={<PlanImpactScreen />} />
            <Route path="/plan/:id/edit" element={<PlanEditScreen />} />
            <Route path="/plan/:id/advice" element={<AdviceScreen />} />
            <Route path="/guide" element={<GuideScreen />} />
            <Route path="/budgets" element={<BudgetsScreen />} />
            <Route path="/savings" element={<SavingsScreen />} />
            <Route path="/invest" element={<InvestScreen />} />
            <Route path="/invest/type/:type" element={<AssetTypeScreen />} />
            <Route path="/invest/holding/:id" element={<HoldingScreen />} />
            <Route path="/news" element={<NewsScreen />} />
            <Route path="/brief/:date" element={<BriefScreen />} />
            <Route path="/accounts" element={<AccountsScreen />} />
            <Route path="/review/:id" element={<ReviewSmsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/settings/sms" element={<SmsAutomationScreen />} />
            <Route
              path="*"
              element={
                <Screen title="Not found" back="/">
                  <div className="card sub">This page does not exist. Go back to Home.</div>
                </Screen>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
