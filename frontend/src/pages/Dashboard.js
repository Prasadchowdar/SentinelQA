import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Shield, Plus, Play, Settings, LogOut, Activity,
  CheckCircle, XCircle, Clock, Building2, ChevronDown,
  BarChart3, Zap, AlertTriangle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from '../components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '../components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  // New project form
  const [newProject, setNewProject] = useState({
    name: '',
    production_url: '',
    staging_url: '',
    ai_instruction: '',
    frequency: 'daily'
  });

  // New org form
  const [newOrgName, setNewOrgName] = useState('');

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    if (currentOrg) {
      fetchProjects();
      fetchStats();
    }
  }, [currentOrg]);

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get(`${API}/organizations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrganizations(response.data);
      if (response.data.length > 0) {
        setCurrentOrg(response.data[0]);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    if (!currentOrg) return;
    try {
      const response = await axios.get(`${API}/organizations/${currentOrg.org_id}/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchStats = async () => {
    if (!currentOrg) return;
    try {
      const response = await axios.get(`${API}/organizations/${currentOrg.org_id}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API}/organizations/${currentOrg.org_id}/projects`,
        newProject,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Project created successfully');
      setCreateProjectOpen(false);
      setNewProject({
        name: '',
        production_url: '',
        staging_url: '',
        ai_instruction: '',
        frequency: 'daily'
      });
      fetchProjects();
      fetchStats();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project');
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        `${API}/organizations`,
        { name: newOrgName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Organization created');
      setCreateOrgOpen(false);
      setNewOrgName('');
      setOrganizations([...organizations, response.data]);
      setCurrentOrg(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create organization');
    }
  };

  const handleRunTest = async (projectId) => {
    try {
      const response = await axios.post(
        `${API}/organizations/${currentOrg.org_id}/projects/${projectId}/run`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Test ${response.data.status === 'pass' ? 'passed' : 'failed'}!`);
      fetchProjects();
      fetchStats();
    } catch (error) {
      toast.error('Failed to run test');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pass':
        return <span className="status-pass px-2 py-1 rounded text-xs font-mono uppercase">Pass</span>;
      case 'fail':
        return <span className="status-fail px-2 py-1 rounded text-xs font-mono uppercase">Fail</span>;
      case 'running':
        return <span className="status-running px-2 py-1 rounded text-xs font-mono uppercase">Running</span>;
      default:
        return <span className="status-idle px-2 py-1 rounded text-xs font-mono uppercase">Idle</span>;
    }
  };

  const formatLastRun = (lastRun) => {
    if (!lastRun) return 'Never';
    const date = new Date(lastRun);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Shield className="w-12 h-12 text-blue-500 animate-pulse" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-blue-500/30 rounded-full animate-ping" />
          </div>
          <div className="text-muted-foreground">Loading Dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-300" data-testid="dashboard">
      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="flex items-center gap-2">
              <Shield className="w-7 h-7 text-blue-500" />
              <span className="text-lg font-bold text-white font-['Chivo']">SentinelQA</span>
            </Link>

            {/* Organization Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="text-zinc-400 hover:text-white flex items-center gap-2"
                  data-testid="org-selector"
                >
                  <Building2 className="w-4 h-4" />
                  {currentOrg?.name || 'Select Organization'}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#171717] border-zinc-800">
                {organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.org_id}
                    onClick={() => setCurrentOrg(org)}
                    className="text-zinc-300 hover:text-white focus:bg-zinc-800"
                  >
                    {org.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-zinc-800" />
                <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-blue-400 hover:text-blue-300 focus:bg-zinc-800"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Organization
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent className="bg-[#0A0A0A] border-zinc-800">
                    <DialogHeader>
                      <DialogTitle className="text-white">Create Organization</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateOrg}>
                      <div className="space-y-4">
                        <div>
                          <Label className="text-zinc-300">Organization Name</Label>
                          <Input
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            placeholder="My Agency"
                            className="bg-[#171717] border-zinc-800 text-white mt-2"
                            required
                            data-testid="new-org-name-input"
                          />
                        </div>
                      </div>
                      <DialogFooter className="mt-6">
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-500" data-testid="create-org-btn">
                          Create Organization
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            {currentOrg && (
              <Link to={`/org/${currentOrg.org_id}/settings`}>
                <Button variant="ghost" className="text-zinc-400 hover:text-white" data-testid="settings-btn">
                  <Settings className="w-5 h-5" />
                </Button>
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-zinc-400 hover:text-white flex items-center gap-2">
                  {user?.picture ? (
                    <img src={user.picture} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                  )}
                  <span className="hidden sm:inline">{user?.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#171717] border-zinc-800">
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-400 hover:text-red-300 focus:bg-zinc-800"
                  data-testid="logout-btn"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-20 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                  </div>
                  <span className="text-sm text-muted-foreground">Total Projects</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{stats.total_projects}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-sm text-muted-foreground">Passing</span>
                </div>
                <p className="text-3xl font-bold text-emerald-400">{stats.passing_projects}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-card border border-border rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <span className="text-sm text-muted-foreground">Failing</span>
                </div>
                <p className="text-3xl font-bold text-red-400">{stats.failing_projects}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-card border border-border rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-sm text-muted-foreground">Pass Rate</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{stats.pass_rate}%</p>
              </motion.div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground font-['Chivo']">Projects</h1>
              <p className="text-sm text-muted-foreground">Monitor your websites and applications</p>
            </div>
            <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-500 btn-glow" data-testid="create-project-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Create New Project</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateProject}>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-zinc-300">Project Name</Label>
                      <Input
                        value={newProject.name}
                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                        placeholder="My E-commerce Store"
                        className="bg-secondary border-border text-foreground mt-2"
                        required
                        data-testid="project-name-input"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Production URL</Label>
                      <Input
                        value={newProject.production_url}
                        onChange={(e) => setNewProject({ ...newProject, production_url: e.target.value })}
                        placeholder="https://mystore.com"
                        className="bg-secondary border-border text-foreground mt-2"
                        required
                        data-testid="production-url-input"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Staging URL (Optional)</Label>
                      <Input
                        value={newProject.staging_url}
                        onChange={(e) => setNewProject({ ...newProject, staging_url: e.target.value })}
                        placeholder="https://staging.mystore.com"
                        className="bg-secondary border-border text-foreground mt-2"
                        data-testid="staging-url-input"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-300">AI Test Instructions</Label>
                      <Textarea
                        value={newProject.ai_instruction}
                        onChange={(e) => setNewProject({ ...newProject, ai_instruction: e.target.value })}
                        placeholder="Go to the homepage, click login, enter test credentials, verify the dashboard loads..."
                        className="bg-secondary border-border text-foreground mt-2 min-h-[100px]"
                        required
                        data-testid="ai-instruction-input"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Run Frequency</Label>
                      <Select
                        value={newProject.frequency}
                        onValueChange={(value) => setNewProject({ ...newProject, frequency: value })}
                      >
                        <SelectTrigger className="bg-secondary border-border text-foreground mt-2" data-testid="frequency-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border-border">
                          <SelectItem value="15min" className="text-zinc-300">Every 15 minutes</SelectItem>
                          <SelectItem value="hourly" className="text-zinc-300">Hourly</SelectItem>
                          <SelectItem value="daily" className="text-zinc-300">Daily</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="mt-6">
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-500" data-testid="submit-project-btn">
                      Create Project
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Projects Grid */}
          {projects.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
              <p className="text-sm text-muted-foreground mb-6">Create your first project to start monitoring</p>
              <Button
                onClick={() => setCreateProjectOpen(true)}
                className="bg-blue-600 hover:bg-blue-500"
                data-testid="empty-create-project-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
              {projects.map((project, i) => (
                <motion.div
                  key={project.project_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-xl p-5 card-hover group"
                  data-testid={`project-card-${project.project_id}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-blue-400 transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {project.production_url}
                      </p>
                    </div>
                    {getStatusBadge(project.status)}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatLastRun(project.last_run)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="w-4 h-4" />
                      {project.frequency}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleRunTest(project.project_id)}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white"
                      data-testid={`run-test-btn-${project.project_id}`}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Run Now
                    </Button>
                    <Link to={`/org/${currentOrg.org_id}/project/${project.project_id}`} className="flex-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        data-testid={`view-project-btn-${project.project_id}`}
                      >
                        View Details
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
