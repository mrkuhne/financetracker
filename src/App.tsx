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
            <Route path="/accounts" element={<AccountsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/settings/sms" element={<SmsAutomationScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
