import type { Permission, Role } from '../data/types';

export const ROLES: Role[] = ['Owner', 'Admin', 'Editor', 'Reviewer', 'Operator'];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'content.read': 'Membaca konten',
  'content.write': 'Menulis & merevisi konten',
  'content.review': 'Menilai hasil kerja',
  'content.publish': 'Menerbitkan konten',
  'media.write': 'Mengelola media',
  'comments.moderate': 'Moderasi komentar',
  'crm.write': 'Mengubah data CRM',
  'agents.configure': 'Mengonfigurasi agent',
  'admin.modules': 'Mengatur modul & akses',
};

export const PERMISSIONS: Record<Permission, Role[]> = {
  'content.read': ['Owner', 'Admin', 'Editor', 'Reviewer', 'Operator'],
  'content.write': ['Owner', 'Admin', 'Editor'],
  'content.review': ['Owner', 'Admin', 'Reviewer'],
  'content.publish': ['Owner'],
  'media.write': ['Owner', 'Admin', 'Editor'],
  'comments.moderate': ['Owner', 'Admin', 'Reviewer'],
  'crm.write': ['Owner', 'Admin', 'Operator'],
  'agents.configure': ['Owner', 'Admin'],
  'admin.modules': ['Owner', 'Admin'],
};

export const hasPermission = (role: Role, permission: Permission) =>
  PERMISSIONS[permission].includes(role);
