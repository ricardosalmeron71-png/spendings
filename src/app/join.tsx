import { router } from 'expo-router';
import { GroupForm } from '@/components/GroupForm';
import { Screen } from '@/components/ui';

export default function Join() {
  return (
    <Screen edges={[]}>
      <GroupForm onDone={() => router.back()} />
    </Screen>
  );
}
