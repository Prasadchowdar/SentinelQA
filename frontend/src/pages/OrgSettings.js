import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Shield, ArrowLeft, Users, UserPlus, Trash2, Building2,
  Mail, Crown, UserCog, Eye
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const OrgSettings = () => {
  const { orgId } = useParams();
  const { token, user } = useAuth();

  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'viewer'
  });

  useEffect(() => {
    fetchOrg();
    fetchMembers();
    fetchIntegrations();
  }, [orgId]);

  const fetchOrg = async () => {
    try {
      const response = await axios.get(`${API}/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrg(response.data);
    } catch (error) {
      console.error('Error fetching org:', error);
      toast.error('Failed to load organization');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await axios.get(`${API}/organizations/${orgId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMembers(response.data);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const response = await axios.get(`${API}/organizations/${orgId}/integrations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIntegrations(response.data);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API}/organizations/${orgId}/invite`,
        inviteForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Invitation sent');
      setInviteOpen(false);
      setInviteForm({ email: '', role: 'viewer' });
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send invitation');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    
    try {
      await axios.delete(`${API}/organizations/${orgId}/members/${memberId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Member removed');
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove member');
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-amber-400" />;
      case 'admin':
        return <UserCog className="w-4 h-4 text-blue-400" />;
      default:
        return <Eye className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'owner':
        return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Owner</span>;
      case 'admin':
        return <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Admin</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">Viewer</span>;
    }
  };

  const canManageMembers = org?.role === 'owner' || org?.role === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]" data-testid="org-settings">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-2">
              <Shield className="w-7 h-7 text-blue-500" />
              <span className="text-lg font-bold text-white font-['Chivo']">SentinelQA</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Settings</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-20 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          {/* Org Header */}
          <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600/10 rounded-xl flex items-center justify-center">
                <Building2 className="w-7 h-7 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white font-['Chivo']">{org?.name}</h1>
                <p className="text-sm text-zinc-400">
                  {members.length} member{members.length !== 1 ? 's' : ''} • Your role: {org?.role}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="members" className="space-y-6">
            <TabsList className="bg-[#0A0A0A] border border-zinc-800">
              <TabsTrigger value="members" className="data-[state=active]:bg-zinc-800" data-testid="members-tab">
                <Users className="w-4 h-4 mr-2" />
                Team Members
              </TabsTrigger>
              <TabsTrigger value="integrations" className="data-[state=active]:bg-zinc-800" data-testid="integrations-tab">
                Integrations
              </TabsTrigger>
            </TabsList>

            {/* Members Tab */}
            <TabsContent value="members">
              <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="font-medium text-white">Team Members</h3>
                  {canManageMembers && (
                    <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                      <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-500" data-testid="invite-member-btn">
                          <UserPlus className="w-4 h-4 mr-2" />
                          Invite Member
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-[#0A0A0A] border-zinc-800">
                        <DialogHeader>
                          <DialogTitle className="text-white">Invite Team Member</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleInvite}>
                          <div className="space-y-4">
                            <div>
                              <Label className="text-zinc-300">Email Address</Label>
                              <Input
                                type="email"
                                value={inviteForm.email}
                                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                                placeholder="colleague@company.com"
                                className="bg-[#171717] border-zinc-800 text-white mt-2"
                                required
                                data-testid="invite-email-input"
                              />
                              <p className="text-xs text-zinc-500 mt-1">User must have a SentinelQA account</p>
                            </div>
                            <div>
                              <Label className="text-zinc-300">Role</Label>
                              <Select
                                value={inviteForm.role}
                                onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}
                              >
                                <SelectTrigger className="bg-[#171717] border-zinc-800 text-white mt-2" data-testid="invite-role-select">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#171717] border-zinc-800">
                                  <SelectItem value="admin" className="text-zinc-300">
                                    Admin - Can create/edit projects and invite members
                                  </SelectItem>
                                  <SelectItem value="viewer" className="text-zinc-300">
                                    Viewer - Can only view projects and results
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter className="mt-6">
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-500" data-testid="send-invite-btn">
                              Send Invitation
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>

                <div className="divide-y divide-zinc-800">
                  {members.map((member) => (
                    <motion.div
                      key={member.member_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 flex items-center justify-between"
                      data-testid={`member-${member.member_id}`}
                    >
                      <div className="flex items-center gap-4">
                        {member.picture ? (
                          <img src={member.picture} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-white">
                            {member.name?.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white">{member.name}</p>
                            {member.user_id === user?.user_id && (
                              <span className="text-xs text-zinc-500">(You)</span>
                            )}
                          </div>
                          <p className="text-sm text-zinc-400 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {member.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getRoleBadge(member.role)}
                        {canManageMembers && member.role !== 'owner' && member.user_id !== user?.user_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveMember(member.member_id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            data-testid={`remove-member-${member.member_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Integrations Tab */}
            <TabsContent value="integrations">
              <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6">
                <h3 className="font-medium text-white mb-6">Available Integrations</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* GitHub Integration */}
                  <div className="bg-[#171717] border border-zinc-800 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-medium text-white">GitHub</h4>
                        <p className="text-xs text-zinc-500">CI/CD Integration</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                      Trigger tests automatically on every push via webhook. Configure in each project settings.
                    </p>
                    <span className="status-pass px-2 py-1 rounded text-xs font-mono">Available</span>
                  </div>

                  {/* Jira Integration (Coming Soon) */}
                  <div className="bg-[#171717] border border-zinc-800 rounded-xl p-5 opacity-60">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M11.53.366c-.527-.464-1.324-.461-1.847.005l-8.73 8.73c-.471.471-.471 1.238 0 1.709l8.73 8.73c.519.519 1.324.523 1.847.005l.001-.001 4.79-4.79 3.87 3.87c.471.471 1.238.471 1.709 0l1.414-1.414c.471-.471.471-1.238 0-1.709l-3.87-3.87 3.87-3.87c.471-.471.471-1.238 0-1.709L22.105.943a1.208 1.208 0 0 0-1.709 0l-3.87 3.87-4.99-4.99-.006.006z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-medium text-white">Jira</h4>
                        <p className="text-xs text-zinc-500">Bug Tracking</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                      Automatically create tickets when tests fail. Available in Enterprise plan.
                    </p>
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">Coming Soon</span>
                  </div>

                  {/* Slack Integration (Coming Soon) */}
                  <div className="bg-[#171717] border border-zinc-800 rounded-xl p-5 opacity-60">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-medium text-white">Slack</h4>
                        <p className="text-xs text-zinc-500">Notifications</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                      Get instant alerts when tests fail. Available in Pro and Enterprise plans.
                    </p>
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">Coming Soon</span>
                  </div>

                  {/* Email Integration */}
                  <div className="bg-[#171717] border border-zinc-800 rounded-xl p-5 opacity-60">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                        <Mail className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="font-medium text-white">Email</h4>
                        <p className="text-xs text-zinc-500">Notifications</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">
                      Receive email alerts and weekly summary reports.
                    </p>
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">Coming Soon</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default OrgSettings;
