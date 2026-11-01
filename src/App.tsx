import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthGate } from '@/features/auth/AuthGate';
import { AppShell } from '@/features/shell/AppShell';
import {
  HomeScreen,
  RecurringScreen,
  TransactionsScreen,
} from '@/features/shell/routes';
import { AccountsScreen } from '@/features/accounts/AccountsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

export default function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/transactions" element={<TransactionsScreen />} />
            <Route path="/recurring" element={<RecurringScreen />} />
            <Route path="/accounts" element={<AccountsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
