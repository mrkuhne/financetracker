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
import { PlanImpactScreen } from '@/features/plan/PlanImpactScreen';

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
            <Route path="/accounts" element={<AccountsScreen />} />
            <Route path="/review/:id" element={<ReviewSmsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/settings/sms" element={<SmsAutomationScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
