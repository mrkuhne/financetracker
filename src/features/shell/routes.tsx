import { TransactionsScreen } from '@/features/transactions/TransactionsScreen';
import { Link } from 'react-router-dom';
import { Screen } from './Screen';

const Soon = ({ text }: { text: string }) => <div className="card sub">{text}</div>;

export const HomeScreen = () => (
  <Screen
    title="Home"
    big
    right={
      <Link to="/settings" className="av" aria-label="Settings">
        D
      </Link>
    }
  >
    <Soon text="Home arrives in a later task." />
    <Link to="/accounts" className="sub">
      Accounts
    </Link>
  </Screen>
);
export const RecurringScreen = () => (
  <Screen title="Recurring" back="/transactions">
    <Soon text="Recurring rules arrive in a later task." />
  </Screen>
);

export { TransactionsScreen };
