import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  LogOut, 
  Shield, 
  User as UserIcon,
  RefreshCw,
  Search,
  AlertCircle,
  Loader2,
  LayoutDashboard,
  Users,
  Ticket,
  MapPin,
  Edit2,
  Download,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  location_id: number | null;
  location_name?: string;
}

interface Location {
  id: number;
  name: string;
}

interface DashboardData {
  totalValidated: number;
  totalVouchers: number;
  validationsByLoc: { name: string; count: number }[];
  recentActivity: {
    code: string;
    location: string;
    username: string;
    validated_at: string;
  }[];
  latestVouchers: {
    code: string;
    created_at: string;
    is_used: number;
  }[];
}

interface ReportData {
  usageByDate: { date: string; count: number }[];
  usageByLocation: { name: string; count: number }[];
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
      secondary: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all',
        className
      )}
      {...props}
    />
  )
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm', className)}>
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('voucherpro_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        localStorage.setItem('voucherpro_user', JSON.stringify(data.user));
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('voucherpro_user');
  };

  if (!user) {
    return <LoginScreen onLogin={handleLogin} loading={loading} error={error} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Ticket className="text-white w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight">VoucherPro</span>
            <span className={cn(
              "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
              user.role === 'admin' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
            )}>
              {user.role}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-medium text-slate-900">{user.username}</span>
              <span className="text-[10px] text-slate-500">{user.location_name || 'Administrator'}</span>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="p-2">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {user.role === 'admin' ? <AdminDashboard /> : <StaffDashboard user={user} />}
      </main>
    </div>
  );
}

// --- Login Screen ---

function LoginScreen({ onLogin, loading, error }: { onLogin: (u: string, p: string) => void, loading: boolean, error: string | null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <Ticket className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">VoucherPro</h1>
          <p className="text-slate-500 text-sm">Sign in to manage vouchers</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onLogin(username, password); }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Username</label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username" required />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-xs font-medium">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full py-3">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Login'}
          </Button>
        </form>
        
        <div className="pt-4 text-center">
          <p className="text-[10px] text-slate-400">Default Admin: admin / admin123</p>
        </div>
      </Card>
    </div>
  );
}

// --- Admin Dashboard ---

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'locations' | 'reports'>('dashboard');
  const [data, setData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  // User Creation
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newLocationId, setNewLocationId] = useState('');

  // Location Management
  const [newLocationName, setNewLocationName] = useState('');
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [editingLocationName, setEditingLocationName] = useState('');

  // Custom Generation
  const [genCount, setGenCount] = useState('10');
  const [genLength, setGenLength] = useState('8');
  const [genIsNumeric, setGenIsNumeric] = useState(false);
  const [genExpiresAt, setGenExpiresAt] = useState('');
  const [genMaxUses, setGenMaxUses] = useState('1');

  const fetchData = async () => {
    try {
      const [dashRes, usersRes, locsRes, reportsRes] = await Promise.all([
        fetch('/api/admin/dashboard'),
        fetch('/api/admin/users'),
        fetch('/api/locations'),
        fetch('/api/admin/reports/usage')
      ]);
      setData(await dashRes.json());
      setUsers(await usersRes.json());
      setLocations(await locsRes.json());
      setReportData(await reportsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerate = async (count: number, length: number = 8, isNumeric: boolean = false, expiresAt?: string, maxUses: number = 1) => {
    try {
      await fetch('/api/admin/vouchers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, length, isNumeric, expiresAt, maxUses }),
      });
      alert(`Generated ${count} vouchers!`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExport = () => {
    window.location.href = '/api/admin/vouchers/export';
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, location_id: newLocationId }),
      });
      if (res.ok) {
        setNewUsername('');
        setNewPassword('');
        setNewLocationId('');
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLocationName }),
      });
      if (res.ok) {
        setNewLocationName('');
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateLocation = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/locations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingLocationName }),
      });
      if (res.ok) {
        setEditingLocationId(null);
        setEditingLocationName('');
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateUserRole = async (id: number, role: string) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <Card className="p-6 bg-indigo-600 text-white border-none">
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">Total Validated</p>
                <p className="mt-2 text-4xl font-bold">{data?.totalValidated}</p>
              </Card>
              <Card className="p-6 bg-white border border-slate-200">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Vouchers</p>
                <p className="mt-2 text-4xl font-bold text-slate-900">{data?.totalVouchers}</p>
              </Card>
              {data?.validationsByLoc.map(loc => (
                <div key={loc.name}>
                  <Card className="p-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{loc.name}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{loc.count}</p>
                  </Card>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <Card>
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Recent Activity</h2>
                    <RefreshCw className="w-4 h-4 text-slate-300 cursor-pointer hover:text-indigo-600 transition-colors" onClick={fetchData} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                          <th className="px-6 py-4">Voucher</th>
                          <th className="px-6 py-4">Location</th>
                          <th className="px-6 py-4">Staff</th>
                          <th className="px-6 py-4">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data?.recentActivity.map((act, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-indigo-600">{act.code}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{act.location}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{act.username}</td>
                            <td className="px-6 py-4 text-xs text-slate-400">{format(new Date(act.validated_at), 'MMM d, HH:mm')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
              <div className="lg:col-span-1 space-y-8">
                <Card className="p-6 space-y-6">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Custom Generation</h2>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantity</label>
                      <Input type="number" value={genCount} onChange={e => setGenCount(e.target.value)} placeholder="10" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Code Length</label>
                      <Input type="number" value={genLength} onChange={e => setGenLength(e.target.value)} placeholder="8" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expires At (Optional)</label>
                      <Input 
                        type="date" 
                        value={genExpiresAt} 
                        onChange={e => setGenExpiresAt(e.target.value)} 
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Uses</label>
                      <select 
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                        value={genMaxUses}
                        onChange={e => setGenMaxUses(e.target.value)}
                      >
                        <option value="1">1 Time</option>
                        <option value="2">2 Times</option>
                        <option value="3">3 Times</option>
                        <option value="5">5 Times</option>
                        <option value="10">10 Times</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="numeric" 
                        checked={genIsNumeric} 
                        onChange={e => setGenIsNumeric(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-slate-200 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="numeric" className="text-xs font-medium text-slate-600">Numbers Only</label>
                    </div>
                    <Button 
                      onClick={() => handleGenerate(parseInt(genCount), parseInt(genLength), genIsNumeric, genExpiresAt, parseInt(genMaxUses))} 
                      className="w-full"
                      disabled={!genCount || !genLength}
                    >
                      <Plus className="w-4 h-4" /> Generate Vouchers
                    </Button>
                  </div>
                </Card>

                <Card>
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Latest Generated</h2>
                    <Button variant="ghost" size="sm" onClick={handleExport} className="h-8 px-2 text-indigo-600">
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </Button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {data?.latestVouchers.map((v, i) => (
                      <div key={i} className="px-6 py-3 flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-700">{v.code}</span>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          v.is_used ? "bg-slate-100 text-slate-400" : "bg-emerald-100 text-emerald-700"
                        )}>
                          {v.is_used ? 'USED' : 'READY'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        );
      case 'users':
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <Card className="p-6">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Create Staff Account</h2>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Username</label>
                      <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Password</label>
                      <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Location</label>
                      <select 
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                        value={newLocationId}
                        onChange={e => setNewLocationId(e.target.value)}
                        required
                      >
                        <option value="">Select Location</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" className="w-full">Create Account</Button>
                  </form>
                </Card>
              </div>
              <div className="lg:col-span-2">
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                          <th className="px-6 py-4">Username</th>
                          <th className="px-6 py-4">Location</th>
                          <th className="px-6 py-4">Role</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900">{u.username}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{u.location_name}</td>
                            <td className="px-6 py-4">
                              <select 
                                value={u.role} 
                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                className="text-xs font-bold uppercase bg-transparent border-none focus:ring-0 cursor-pointer"
                              >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDeleteUser(u.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        );
      case 'locations':
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <Card className="p-6">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Add New Branch</h2>
                  <form onSubmit={handleCreateLocation} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Branch Name</label>
                      <Input 
                        value={newLocationName} 
                        onChange={e => setNewLocationName(e.target.value)} 
                        placeholder="e.g. Downtown Branch"
                        required 
                      />
                    </div>
                    <Button type="submit" className="w-full">Add Branch</Button>
                  </form>
                </Card>
              </div>
              <div className="lg:col-span-2">
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                          <th className="px-6 py-4">Branch Name</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {locations.map(loc => (
                          <tr key={loc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              {editingLocationId === loc.id ? (
                                <Input 
                                  value={editingLocationName} 
                                  onChange={e => setEditingLocationName(e.target.value)}
                                  className="max-w-xs"
                                  autoFocus
                                />
                              ) : (
                                <span className="font-medium text-slate-900">{loc.name}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {editingLocationId === loc.id ? (
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" onClick={() => { setEditingLocationId(null); setEditingLocationName(''); }}>Cancel</Button>
                                  <Button onClick={() => handleUpdateLocation(loc.id)}>Save</Button>
                                </div>
                              ) : (
                                <Button variant="ghost" onClick={() => { setEditingLocationId(loc.id); setEditingLocationName(loc.name); }}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        );
      case 'reports':
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="p-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Validations Over Time</h2>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData?.usageByDate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        cursor={{ fill: '#f1f5f9' }}
                      />
                      <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Validations" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Validations by Branch</h2>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData?.usageByLocation} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" fontSize={12} />
                      <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} width={100} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        cursor={{ fill: '#f1f5f9' }}
                      />
                      <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} name="Validations" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn("pb-4 text-sm font-bold transition-all px-2", activeTab === 'dashboard' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
        >
          DASHBOARD
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={cn("pb-4 text-sm font-bold transition-all px-2", activeTab === 'users' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
        >
          STAFF ACCOUNTS
        </button>
        <button 
          onClick={() => setActiveTab('locations')}
          className={cn("pb-4 text-sm font-bold transition-all px-2", activeTab === 'locations' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
        >
          BRANCHES
        </button>
        <button 
          onClick={() => setActiveTab('reports')}
          className={cn("pb-4 text-sm font-bold transition-all px-2", activeTab === 'reports' ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-400")}
        >
          REPORTS
        </button>
      </div>

      {renderTabContent()}
    </div>
  );
}

// --- Staff Dashboard ---

function StaffDashboard({ user }: { user: User }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<{ code: string; validated_at: string; location_name: string }[]>([]);
  const [stats, setStats] = useState<{ total: number; today: number }>({ total: 0, today: 0 });

  const fetchData = async () => {
    try {
      const [histRes, statsRes] = await Promise.all([
        fetch(`/api/user/history/${user.id}`),
        fetch(`/api/user/stats/${user.id}`)
      ]);
      
      if (histRes.ok) setHistory(await histRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.id]);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, user_id: user.id, location_id: user.location_id }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: data.message });
        setCode('');
        fetchData();
      } else {
        setResult({ success: false, message: data.error });
      }
    } catch (err) {
      setResult({ success: false, message: 'Server connection error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Voucher Validation</h1>
        <p className="text-slate-500">Logged in at <span className="font-bold text-indigo-600">{user.location_name}</span></p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-indigo-50 border-indigo-100 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">Validated Today</p>
          <p className="text-3xl font-bold text-indigo-700">{stats.today}</p>
        </Card>
        <Card className="p-4 bg-emerald-50 border-emerald-100 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Total Validated</p>
          <p className="text-3xl font-bold text-emerald-700">{stats.total}</p>
        </Card>
      </div>

      <Card className="p-8 space-y-8">
        <form onSubmit={handleValidate} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center block">Enter Voucher Code</label>
            <input 
              type="text" 
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ABC12345"
              className="w-full text-center text-4xl font-mono font-bold tracking-widest py-6 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-200"
              required
              autoFocus
            />
          </div>
          <Button type="submit" disabled={loading || !code} className="w-full py-4 text-lg font-bold">
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Validate Voucher'}
          </Button>
        </form>

        {result && (
          <div className={cn(
            "p-6 rounded-2xl border-2 flex flex-col items-center gap-3 animate-in zoom-in-95 duration-200",
            result.success ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
          )}>
            {result.success ? <CheckCircle2 className="w-12 h-12 text-emerald-500" /> : <XCircle className="w-12 h-12 text-red-500" />}
            <p className="text-xl font-bold">{result.message}</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Search className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Real-time</p>
            <p className="text-xs font-medium text-slate-600">Instant Check</p>
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Secure</p>
            <p className="text-xs font-medium text-slate-600">Fraud Protection</p>
          </div>
        </div>
      </div>

      <Card>
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Your Recent Validations</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                <th className="px-6 py-4">Voucher</th>
                <th className="px-6 py-4">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-indigo-600">{h.code}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">{format(new Date(h.validated_at), 'MMM d, HH:mm')}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-sm text-slate-400">No validations yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
