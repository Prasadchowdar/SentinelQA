import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Shield, ArrowLeft, Play, Settings, Clock, Activity,
  CheckCircle, XCircle, AlertTriangle, Copy, ExternalLink,
  GitBranch, Video, Terminal, X
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ProjectDetail = () => {
  const { orgId, projectId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [testRuns, setTestRuns] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  const [editForm, setEditForm] = useState({
    name: '',
    production_url: '',
    staging_url: '',
    ai_instruction: '',
    frequency: 'daily'
  });

  useEffect(() => {
    fetchProject();
    fetchTestRuns();
    fetchWebhook();
  }, [projectId]);

  // Poll for updates for 30 seconds to catch test completions
  // Stops automatically to avoid excessive API calls
  useEffect(() => {
    let pollCount = 0;
    const maxPolls = 10; // Poll for 30 seconds (10 * 3s), then stop

    const interval = setInterval(() => {
      pollCount++;
      if (pollCount <= maxPolls) {
        fetchProject();
        fetchTestRuns();
      } else {
        clearInterval(interval);
        console.log('Auto-refresh stopped after 30s');
      }
    }, 3000);

    return () => clearInterval(interval); // Cleanup on unmount
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const response = await axios.get(`${API}/organizations/${orgId}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      setEditForm({
        name: response.data.name,
        production_url: response.data.production_url,
        staging_url: response.data.staging_url || '',
        ai_instruction: response.data.ai_instruction,
        frequency: response.data.frequency
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      toast.error('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const fetchTestRuns = async () => {
    try {
      const response = await axios.get(`${API}/organizations/${orgId}/projects/${projectId}/runs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTestRuns(response.data);
    } catch (error) {
      console.error('Error fetching test runs:', error);
    }
  };

  const fetchWebhook = async () => {
    try {
      const response = await axios.get(`${API}/organizations/${orgId}/projects/${projectId}/webhook`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWebhookUrl(response.data.webhook_url);
    } catch (error) {
      console.error('Error fetching webhook:', error);
    }
  };

  const handleRunTest = async () => {
    try {
      toast.info('Test started - results will appear automatically...');
      const response = await axios.post(
        `${API}/organizations/${orgId}/projects/${projectId}/run`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Test ${response.data.status === 'pass' ? 'passed' : 'failed'}!`);
      // Poll will pick up the changes automatically
      fetchProject();
      fetchTestRuns();
    } catch (error) {
      toast.error('Failed to run test');
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    try {
      await axios.put(
        `${API}/organizations/${orgId}/projects/${projectId}`,
        editForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Project updated');
      setEditOpen(false);
      fetchProject();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update project');
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;

    try {
      await axios.delete(`${API}/organizations/${orgId}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Project deleted');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pass':
        return <span className="status-pass px-2 py-1 rounded text-xs font-mono uppercase flex items-center gap-1"><CheckCircle className="w-3 h-3" />Pass</span>;
      case 'fail':
        return <span className="status-fail px-2 py-1 rounded text-xs font-mono uppercase flex items-center gap-1"><XCircle className="w-3 h-3" />Fail</span>;
      case 'running':
        return <span className="status-running px-2 py-1 rounded text-xs font-mono uppercase flex items-center gap-1"><Activity className="w-3 h-3" />Running</span>;
      default:
        return <span className="status-idle px-2 py-1 rounded text-xs font-mono uppercase">Idle</span>;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <p className="text-zinc-400">Project not found</p>
          <Link to="/dashboard">
            <Button className="mt-4">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]" data-testid="project-detail">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-2">
              <Shield className="w-7 h-7 text-blue-500" />
              <span className="text-lg font-bold text-white font-['Chivo']">SentinelQA</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{project.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRunTest}
              className="bg-blue-600 hover:bg-blue-500 btn-glow"
              data-testid="run-test-btn"
            >
              <Play className="w-4 h-4 mr-2" />
              Run Test
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              data-testid="edit-project-btn"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-20 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          {/* Project Header */}
          <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-white font-['Chivo']">{project.name}</h1>
                  {getStatusBadge(project.status)}
                </div>
                <a
                  href={project.production_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {project.production_url}
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-400">Last Run</p>
                <p className="text-white">{project.last_run ? formatDate(project.last_run) : 'Never'}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="runs" className="space-y-6">
            <TabsList className="bg-[#0A0A0A] border border-zinc-800">
              <TabsTrigger value="runs" className="data-[state=active]:bg-zinc-800" data-testid="runs-tab">
                Test Runs
              </TabsTrigger>
              <TabsTrigger value="config" className="data-[state=active]:bg-zinc-800" data-testid="config-tab">
                Configuration
              </TabsTrigger>
              <TabsTrigger value="webhook" className="data-[state=active]:bg-zinc-800" data-testid="webhook-tab">
                GitHub Webhook
              </TabsTrigger>
            </TabsList>

            {/* Test Runs Tab */}
            <TabsContent value="runs">
              <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl overflow-hidden">
                {testRuns.length === 0 ? (
                  <div className="p-12 text-center">
                    <Activity className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No test runs yet</h3>
                    <p className="text-sm text-zinc-400 mb-6">Run your first test to see results here</p>
                    <Button onClick={handleRunTest} className="bg-blue-600 hover:bg-blue-500">
                      <Play className="w-4 h-4 mr-2" />
                      Run First Test
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {testRuns.map((run) => (
                      <motion.div
                        key={run.run_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 hover:bg-zinc-900/50 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedRun(run);
                          setVideoModalOpen(true);
                        }}
                        data-testid={`test-run-${run.run_id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {getStatusBadge(run.status)}
                            <div>
                              <p className="text-white text-sm">{formatDate(run.started_at)}</p>
                              <p className="text-xs text-zinc-500">
                                Duration: {formatDuration(run.duration_ms)}
                                {run.trigger === 'github_webhook' && ' • Triggered by GitHub'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {run.bug_summary && (
                              <span className="text-sm text-red-400 bg-red-500/10 px-3 py-1 rounded">
                                {run.bug_summary}
                              </span>
                            )}
                            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                              <Video className="w-4 h-4 mr-1" />
                              View Recording
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Configuration Tab */}
            <TabsContent value="config">
              <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6">Test Configuration</h3>
                <div className="space-y-6">
                  <div>
                    <Label className="text-zinc-400 text-sm">Production URL</Label>
                    <p className="text-white mt-1">{project.production_url}</p>
                  </div>
                  {project.staging_url && (
                    <div>
                      <Label className="text-zinc-400 text-sm">Staging URL</Label>
                      <p className="text-white mt-1">{project.staging_url}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-zinc-400 text-sm">Run Frequency</Label>
                    <p className="text-white mt-1 capitalize">{project.frequency}</p>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-sm">AI Test Instructions</Label>
                    <div className="mt-2 bg-[#171717] border border-zinc-800 rounded-lg p-4 font-mono text-sm text-zinc-300">
                      {project.ai_instruction}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Webhook Tab */}
            <TabsContent value="webhook">
              <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">GitHub Integration</h3>
                    <p className="text-sm text-zinc-400">Trigger tests automatically on every push</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-zinc-400 text-sm mb-2 block">Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={webhookUrl}
                        readOnly
                        className="bg-[#171717] border-zinc-800 text-white font-mono text-sm"
                        data-testid="webhook-url-input"
                      />
                      <Button
                        variant="outline"
                        onClick={copyWebhook}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        data-testid="copy-webhook-btn"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-[#171717] border border-zinc-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-white mb-3">Setup Instructions</h4>
                    <ol className="text-sm text-zinc-400 space-y-2 list-decimal list-inside">
                      <li>Go to your GitHub repository → Settings → Webhooks</li>
                      <li>Click "Add webhook"</li>
                      <li>Paste the webhook URL above</li>
                      <li>Set Content type to "application/json"</li>
                      <li>Select "Just the push event"</li>
                      <li>Click "Add webhook"</li>
                    </ol>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Edit Project Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#0A0A0A] border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Project Settings</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateProject}>
            <div className="space-y-4">
              <div>
                <Label className="text-zinc-300">Project Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="bg-[#171717] border-zinc-800 text-white mt-2"
                  required
                  data-testid="edit-name-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Production URL</Label>
                <Input
                  value={editForm.production_url}
                  onChange={(e) => setEditForm({ ...editForm, production_url: e.target.value })}
                  className="bg-[#171717] border-zinc-800 text-white mt-2"
                  required
                  data-testid="edit-production-url-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Staging URL (Optional)</Label>
                <Input
                  value={editForm.staging_url}
                  onChange={(e) => setEditForm({ ...editForm, staging_url: e.target.value })}
                  className="bg-[#171717] border-zinc-800 text-white mt-2"
                  data-testid="edit-staging-url-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300">AI Test Instructions</Label>
                <Textarea
                  value={editForm.ai_instruction}
                  onChange={(e) => setEditForm({ ...editForm, ai_instruction: e.target.value })}
                  className="bg-[#171717] border-zinc-800 text-white mt-2 min-h-[100px]"
                  required
                  data-testid="edit-ai-instruction-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Run Frequency</Label>
                <Select
                  value={editForm.frequency}
                  onValueChange={(value) => setEditForm({ ...editForm, frequency: value })}
                >
                  <SelectTrigger className="bg-[#171717] border-zinc-800 text-white mt-2" data-testid="edit-frequency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-zinc-800">
                    <SelectItem value="15min" className="text-zinc-300">Every 15 minutes</SelectItem>
                    <SelectItem value="hourly" className="text-zinc-300">Hourly</SelectItem>
                    <SelectItem value="daily" className="text-zinc-300">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-6 flex justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteProject}
                className="bg-red-600 hover:bg-red-500"
                data-testid="delete-project-btn"
              >
                Delete Project
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-500" data-testid="save-project-btn">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Video Modal (Mocked for MVP) */}
      <Dialog open={videoModalOpen} onOpenChange={setVideoModalOpen}>
        <DialogContent className="bg-[#0A0A0A] border-zinc-800 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <Video className="w-5 h-5 text-blue-400" />
              Test Recording
              {selectedRun && getStatusBadge(selectedRun.status)}
            </DialogTitle>
          </DialogHeader>

          {selectedRun && (() => {
            const videoPath = selectedRun.video_path;
            const videoFilename = videoPath ? videoPath.split(/[/\\]/).pop() : null;
            const videoUrl = videoFilename ? `${process.env.REACT_APP_BACKEND_URL}/videos/${videoFilename}` : null;

            console.log('Video Debug:', {
              videoPath,
              videoFilename,
              videoUrl,
              backendUrl: process.env.REACT_APP_BACKEND_URL
            });

            return (
              <div className="space-y-4">
                {/* Real Video Player */}
                <div className="aspect-video bg-[#171717] rounded-lg border border-zinc-800 overflow-hidden">
                  {videoUrl ? (
                    <video
                      controls
                      className="w-full h-full"
                      src={videoUrl}
                      data-testid="test-video-player"
                      onError={(e) => console.error('Video load error:', e)}
                      onLoadStart={() => console.log('Video loading started')}
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <Terminal className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                        <p className="text-zinc-400 mb-2">Video recording not available</p>
                        <p className="text-sm text-zinc-500">The video may still be processing or was not recorded</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Analysis */}
                <div className="bg-[#171717] border border-zinc-800 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2 sticky top-0 bg-[#171717] pb-2">
                    <Terminal className="w-4 h-4 text-blue-400" />
                    AI Analysis
                  </h4>
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {selectedRun.ai_summary || 'No analysis available'}
                  </p>
                </div>

                {/* Run Details */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-[#171717] border border-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 mb-1">Started</p>
                    <p className="text-white">{formatDate(selectedRun.started_at)}</p>
                  </div>
                  <div className="bg-[#171717] border border-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 mb-1">Completed</p>
                    <p className="text-white">{formatDate(selectedRun.completed_at)}</p>
                  </div>
                  <div className="bg-[#171717] border border-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 mb-1">Duration</p>
                    <p className="text-white">{formatDuration(selectedRun.duration_ms)}</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectDetail;
