import { ShieldAlert } from 'lucide-react';

export function RestrictedNotice({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <ShieldAlert size={28} className="text-amber-ink mb-3" />
      <p className="text-base font-semibold text-text max-w-md">{message}</p>
    </div>
  );
}
