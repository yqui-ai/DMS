import { useState } from 'react';
import { Select } from '../../components/Select';
import { UserPlus, X } from 'lucide-react';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { Input } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { useProjectMembers, useRoles, useMemberMutations, type ProjectMember } from '../../lib/queries/members';
import { fmtDateTime } from '../../lib/format';
import type { RoleId } from '../../types/entities';

const STATUS_VARIANT = { Active: 'accent', Invited: 'warn', Disabled: 'neutral' } as const;

export function UsersTab({ programId }: { programId: string }) {
  const toast = useToast();
  const { data: members = [], isLoading } = useProjectMembers(programId);
  const { data: roles = [] } = useRoles();
  const mutations = useMemberMutations(programId);

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<RoleId>('end_user');
  const [busy, setBusy] = useState(false);

  const addUser = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await mutations.addByEmail(email.trim(), roleId);
      toast.success(`${email} added to the programme.`);
      setEmail(''); setAdding(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add user.');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (member: ProjectMember, next: RoleId) => {
    try {
      await mutations.updateRole(member.membershipId, next);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not update role.');
    }
  };

  const removeMember = async (member: ProjectMember) => {
    try {
      await mutations.remove(member.membershipId);
      toast.info(`${member.name} removed from the programme.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not remove user.');
    }
  };

  const columns: Column<ProjectMember>[] = [
    { key: 'name', header: 'Name', render: (m) => <span className="font-semibold text-text">{m.name}</span> },
    { key: 'email', header: 'Email', render: (m) => <span className="font-mono text-sm2">{m.email}</span> },
    {
      key: 'role', header: 'Role',
      render: (m) => (
        <Select
          value={m.roleId} onChange={(e) => changeRole(m, e.target.value as RoleId)}
          size="sm"
        >
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      ),
    },
    { key: 'status', header: 'Status', render: (m) => <Tag variant={STATUS_VARIANT[m.status]}>{m.status}</Tag> },
    { key: 'lastLogin', header: 'Last Login', render: (m) => fmtDateTime(m.lastLogin) },
    { key: 'scope', header: 'Scope', render: (m) => m.subprojectId ? <span className="text-sm2 text-muted">This subproject</span> : <span className="text-sm2 text-muted">Whole programme</span> },
    {
      key: 'actions', header: '', frozen: true, width: 40,
      render: (m) => (
        <button onClick={() => removeMember(m)} className="text-red hover:bg-red-light p-1 rounded" aria-label={`Remove ${m.name}`}>
          <X size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {adding ? (
          <div className="flex items-center gap-2 bg-surface rounded-lg shadow-card p-2.5">
            <Input placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-56" />
            <Select
              value={roleId} onChange={(e) => setRoleId(e.target.value as RoleId)}
              size="sm"
            >
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <Button variant="primary" onClick={addUser} disabled={busy}>{busy ? 'Adding…' : 'Add'}</Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}><UserPlus size={14} /> Add user</Button>
        )}
      </div>

      <Table
        columns={columns}
        rows={members}
        rowKey={(m) => m.membershipId}
        emptyMessage={isLoading ? 'Loading…' : 'No users on this programme yet.'}
      />
    </div>
  );
}
