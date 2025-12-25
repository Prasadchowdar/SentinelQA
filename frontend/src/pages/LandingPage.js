import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Zap, GitBranch, Activity, Play, CheckCircle, Terminal, Eye, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';

const LandingPage = () => {
  const features = [
    {
      icon: <Eye className="w-6 h-6" />,
      title: "AI-Powered Testing",
      description: "Our AI browses your site like a real user—clicking, typing, and verifying workflows automatically."
    },
    {
      icon: <GitBranch className="w-6 h-6" />,
      title: "CI/CD Integration",
      description: "Connect with GitHub to run tests automatically whenever you push code."
    },
    {
      icon: <Activity className="w-6 h-6" />,
      title: "Real-Time Monitoring",
      description: "Get instant alerts when something breaks. Peace of mind, 24/7."
    },
    {
      icon: <Terminal className="w-6 h-6" />,
      title: "Video Evidence",
      description: "Watch exactly what the AI saw when it found a bug. Debug faster."
    }
  ];

  const pricingTiers = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      features: ["1 Project", "Daily Runs", "3-Day History", "1 User"],
      cta: "Get Started",
      highlight: false
    },
    {
      name: "Pro",
      price: "$49",
      period: "/month",
      features: ["5 Projects", "Hourly Runs", "30-Day History", "3 Users", "GitHub Integration"],
      cta: "Start Free Trial",
      highlight: true
    },
    {
      name: "Enterprise",
      price: "$199",
      period: "/month",
      features: ["Unlimited Projects", "15-Min Runs", "Unlimited History", "Unlimited Users", "All Integrations", "Priority Support"],
      cta: "Contact Sales",
      highlight: false
    }
  ];

  return (
    <div className="min-h-screen gradient-bg overflow-hidden">
      {/* Floating Orbs Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="floating-orb orb-blue w-96 h-96 -top-48 -left-48" />
        <div className="floating-orb orb-purple w-80 h-80 top-1/3 -right-40" style={{animationDelay: '-5s'}} />
        <div className="floating-orb orb-cyan w-64 h-64 bottom-20 left-1/4" style={{animationDelay: '-10s'}} />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-500" />
            <span className="text-xl font-bold text-white font-['Chivo']">SentinelQA</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" className="text-zinc-400 hover:text-white" data-testid="nav-login-btn">
                Log in
              </Button>
            </Link>
            <Link to="/register">
              <Button className="bg-blue-600 hover:bg-blue-500 btn-glow" data-testid="nav-signup-btn">
                Sign up free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-8 animate-bounce-subtle">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-400 font-medium">AI-Powered QA Platform</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black text-white leading-none tracking-tight mb-6 font-['Chivo']">
              Your Website's
              <br />
              <span className="gradient-text">Autonomous Guardian</span>
            </h1>
            
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              SentinelQA continuously tests your web applications like a real user. 
              Catch bugs before your customers do.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register">
                <Button 
                  size="lg" 
                  className="bg-blue-600 hover:bg-blue-500 btn-glow px-8 py-6 text-lg"
                  data-testid="hero-cta-btn"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start Testing Free
                </Button>
              </Link>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-8 py-6 text-lg"
                data-testid="hero-demo-btn"
              >
                Watch Demo
              </Button>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent z-10" />
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-4 text-sm text-zinc-500 font-mono">dashboard.sentinelqa.io</span>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Mock Project Cards */}
                {['Shopify Store', 'Marketing Site', 'API Portal'].map((name, i) => (
                  <div key={i} className="bg-[#171717] rounded-lg p-4 border border-zinc-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-white">{name}</span>
                      <span className={`px-2 py-1 rounded text-xs font-mono ${
                        i === 1 ? 'status-fail' : 'status-pass'
                      }`}>
                        {i === 1 ? 'FAIL' : 'PASS'}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500 mb-2">Last run: 15 mins ago</p>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${i === 1 ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: i === 1 ? '60%' : '100%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-['Chivo']">
              Testing That Works While You Sleep
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Set it once, forget about it. SentinelQA monitors your applications 24/7.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-[#171717] border border-zinc-800 rounded-xl p-6 card-hover"
              >
                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-['Chivo']">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-zinc-400">
              Start free. Scale as you grow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingTiers.map((tier, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                className={`rounded-xl p-6 ${
                  tier.highlight 
                    ? 'bg-blue-600/10 border-2 border-blue-500 glow-primary' 
                    : 'bg-[#0A0A0A] border border-zinc-800'
                }`}
              >
                <h3 className="text-lg font-semibold text-white mb-2">{tier.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">{tier.price}</span>
                  <span className="text-zinc-400">{tier.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-zinc-300">
                      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button 
                  className={`w-full ${
                    tier.highlight 
                      ? 'bg-blue-600 hover:bg-blue-500 btn-glow' 
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}
                  data-testid={`pricing-${tier.name.toLowerCase()}-btn`}
                >
                  {tier.cta}
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-[#050505] to-blue-950/20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 font-['Chivo']">
            Ready to Ship with Confidence?
          </h2>
          <p className="text-lg text-zinc-400 mb-8">
            Join hundreds of teams using SentinelQA to catch bugs before users do.
          </p>
          <Link to="/register">
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-500 btn-glow px-10 py-6 text-lg"
              data-testid="cta-signup-btn"
            >
              Start Testing Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-white font-['Chivo']">SentinelQA</span>
          </div>
          <p className="text-sm text-zinc-500">
            © 2024 SentinelQA Enterprise. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
