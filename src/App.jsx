import { useEffect, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp,
  Clapperboard, Clock3, Copy, FileText, FolderOpen, KeyRound, Layers3,
  LoaderCircle, MessageSquareText, MoreHorizontal, Plus, RefreshCw,
  Settings2, Sparkles, WandSparkles, X,
} from 'lucide-react';
import './story-details.css';
import { responseText } from './story-response.js';

const PROJECTS_KEY = 'comiccraft-projects-v1';
const STYLES = ['Indie ink', 'Saturday morning', 'Watercolor dream', 'Retro sci-fi', 'Paper cutout'];
const TONES = ['Adventurous', 'Whimsical', 'Mysterious', 'Heartwarming', 'Dramatic'];
const SETTINGS = ['An old observatory beneath a deep blue sky', 'A quiet coastal town', 'A distant planet', 'A magical forest', 'A bustling city', 'A small mountain village', 'An underwater kingdom'];
const COLORS = ['#405881', '#d9934c', '#6f8290', '#e26d50'];
const SAMPLE = [
  { caption: 'Every night, Mira collected the fallen stars from the old observatory roof.', dialogue: 'One more for the jar.', scene: 'A young girl in a yellow raincoat reaches for a tiny glowing star on a slate rooftop beneath a deep blue sky.', art: 'sky' },
  { caption: 'This one was different. It hummed a tune she almost remembered.', dialogue: 'Wait. I know that song.', scene: 'Mira holds a bright little star close to her face; its warm golden light illuminates her surprised eyes.', art: 'star' },
  { caption: 'The star slipped from her hands and floated toward the silent telescope.', dialogue: 'Are you trying to show me something?', scene: 'A luminous star drifts through the observatory dome toward a large brass telescope, with Mira following behind.', art: 'dome' },
  { caption: 'Together, they found the missing piece of the night sky.', dialogue: 'There you are.', scene: 'The glowing star rejoins a constellation through an open observatory dome; Mira watches the sky sparkle again.', art: 'constellation' },
].map((panel, index) => ({ ...panel, id: `sample-${index}`, color: COLORS[index] }));

function loadProjects() {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || 'null');
    if (Array.isArray(projects) && projects.length) return projects;
  } catch { /* Start with a sample if the stored draft is invalid. */ }
  return [{
    id: 'sample-project', title: 'The Star Collector',
    idea: 'A girl who collects fallen stars finds one that remembers a song.',
    mainCharacter: 'Mira, a curious young stargazer', setting: 'An old observatory beneath a deep blue sky',
    tone: 'Heartwarming', style: STYLES[0], panels: SAMPLE, updatedAt: Date.now(),
  }];
}

async function requestStory(input, generationConfig) {
  const response = await fetch('/api/story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, generation_config: generationConfig }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error || `Gemini request failed (${response.status}).`);
  return result;
}

export default function App() {
  const [projects, setProjects] = useState(loadProjects);
  const [activeId, setActiveId] = useState(() => loadProjects()[0]?.id);
  const active = projects.find(project => project.id === activeId) || projects[0];
  const [idea, setIdea] = useState(active?.idea || '');
  const [mainCharacter, setMainCharacter] = useState(active?.mainCharacter || '');
  const [setting, setSetting] = useState(active?.setting || '');
  const [tone, setTone] = useState(active?.tone || TONES[0]);
  const [style, setStyle] = useState(active?.style || STYLES[0]);
  const [panelCount, setPanelCount] = useState(active?.panels?.length || 4);
  const [serviceStatus, setServiceStatus] = useState({ geminiConfigured: false, stableDiffusionConfigured: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [artInProgress, setArtInProgress] = useState('');
  const [selectedId, setSelectedId] = useState(active?.panels?.[0]?.id || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  async function refreshServiceStatus() {
    try {
      const response = await fetch('/api/status');
      setServiceStatus(await response.json());
    } catch {
      setServiceStatus({ geminiConfigured: false, stableDiffusionConfigured: false });
    }
  }

  useEffect(() => {
    try { sessionStorage.removeItem('comiccraft-gemini-key'); } catch { /* Storage may be unavailable in restricted browser contexts. */ }
    refreshServiceStatus();
  }, []);

  useEffect(() => {
    const saved = projects.map(({ panels, ...project }) => ({
      ...project,
      panels: panels.map(({ imageUrl, ...panel }) => panel),
    }));
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(saved));
  }, [projects]);

  useEffect(() => {
    if (!active) return;
    setIdea(active.idea || '');
    setMainCharacter(active.mainCharacter || '');
    setSetting(active.setting || '');
    setTone(active.tone || TONES[0]);
    setStyle(active.style || STYLES[0]);
    setPanelCount(active.panels?.length || 4);
    setSelectedId(active.panels?.[0]?.id || '');
    setError('');
  }, [activeId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selected = active?.panels?.find(panel => panel.id === selectedId) || active?.panels?.[0];

  function updateProject(id, changes) {
    setProjects(current => current.map(project => project.id === id
      ? { ...project, ...changes, updatedAt: Date.now() } : project));
  }

  function newProject() {
    const project = { id: crypto.randomUUID(), title: 'Untitled comic', idea: '', mainCharacter: '', setting: '', tone: TONES[0], style: STYLES[0], panels: [], updatedAt: Date.now() };
    setProjects(current => [project, ...current]);
    setActiveId(project.id);
    setIdea(''); setMainCharacter(''); setSetting(''); setTone(TONES[0]); setStyle(STYLES[0]); setPanelCount(4);
  }

  async function generateStory(event) {
    event?.preventDefault();
    if (!idea.trim()) { setError('Add a story idea first.'); return; }
    if (!serviceStatus.geminiConfigured) { setSettingsOpen(true); setError('Configure GEMINI_API_KEY on the server to generate a story.'); return; }
    setGenerating(true); setError('');
    try {
      const result = await requestStory(
        `Create a cohesive ${panelCount}-panel comic story based on this idea: "${idea.trim()}". Main character: ${mainCharacter.trim() || 'Create a fitting protagonist'}. Setting: ${setting.trim() || 'Choose a setting that fits the idea'}. Tone: ${tone}. Visual style: ${style}. Return ONLY valid JSON with this exact shape: {"title":"short title","panels":[{"caption":"one short narration sentence","dialogue":"short spoken line or empty string","scene":"specific visual description for this panel"}]}. Keep characters and appearance consistent across panels, give the story a satisfying ending, and make every scene directly drawable. Exactly ${panelCount} panels.`,
        { temperature: 0.85 },
      );
      const story = JSON.parse(responseText(result).replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
      if (!Array.isArray(story.panels) || !story.panels.length) throw new Error('Gemini returned no comic panels. Try again.');
      const panels = story.panels.map((panel, index) => ({
        id: crypto.randomUUID(), caption: panel.caption || '', dialogue: panel.dialogue || '',
        scene: panel.scene || '', art: ['sky', 'star', 'dome', 'constellation'][index % 4],
        color: COLORS[index % COLORS.length],
      }));
      updateProject(active.id, { title: story.title || idea.trim().slice(0, 36), idea: idea.trim(), mainCharacter, setting, tone, style, panels });
      setSelectedId(panels[0].id); setNotice('Your comic script is ready.');
    } catch (cause) {
      setError(cause instanceof SyntaxError ? 'The response could not be read as a comic. Try generating again.' : cause.message);
    } finally { setGenerating(false); }
  }

  async function generateArt(panel) {
    if (!serviceStatus.stableDiffusionConfigured) { setSettingsOpen(true); setError('Configure STABLE_DIFFUSION_URL on the server to generate artwork.'); return; }
    setArtInProgress(panel.id); setError('');
    try {
      const result = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Comic-book panel, no text or speech bubbles. Style: ${style}. Scene: ${panel.scene}. Keep a consistent hand-drawn graphic-novel look, expressive characters, clear silhouettes, vivid print-like colors, landscape 3:2 composition.` }),
      });
      const image = await result.json();
      if (!result.ok) throw new Error(image?.error || `Stable Diffusion request failed (${result.status}).`);
      const imageData = image.imageData;
      const mimeType = image.mimeType || 'image/png';
      if (!imageData) throw new Error('Stable Diffusion returned an empty image. Try again.');
      setProjects(current => current.map(project => project.id === active.id
        ? { ...project, panels: project.panels.map(item => item.id === panel.id ? { ...item, imageUrl: `data:${mimeType};base64,${imageData}` } : item) }
        : project));
      setNotice('Panel artwork generated.');
    } catch (cause) { setError(cause.message); }
    finally { setArtInProgress(''); }
  }

  function exportProject(format) {
    const body = format === 'json'
      ? JSON.stringify({ title: active.title, idea: active.idea, mainCharacter: active.mainCharacter, setting: active.setting, tone: active.tone, style: active.style, panels: active.panels }, null, 2)
      : `${active.title}\n${'='.repeat(active.title.length)}\n\nIdea: ${active.idea}\nMain character: ${active.mainCharacter || 'Not specified'}\nSetting: ${active.setting || 'Not specified'}\nTone: ${active.tone || TONES[0]}\nStyle: ${active.style}\n\n${active.panels.map((panel, index) => `PANEL ${String(index + 1).padStart(2, '0')}\n${panel.caption}\n${panel.dialogue ? `“${panel.dialogue}”\n` : ''}Scene: ${panel.scene}`).join('\n\n')}`;
    const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(active.title || 'comic').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`;
    link.click(); URL.revokeObjectURL(link.href); setExportOpen(false);
  }

  function editPanel(panelId, field, value) {
    updateProject(active.id, { panels: active.panels.map(panel => panel.id === panelId ? { ...panel, [field]: value } : panel) });
  }

  function addPanel() {
    const panel = {
      id: crypto.randomUUID(), caption: '', dialogue: '', scene: 'Describe the next moment in your story.',
      art: ['sky', 'star', 'dome', 'constellation'][active.panels.length % 4],
      color: COLORS[active.panels.length % COLORS.length],
    };
    updateProject(active.id, { panels: [...active.panels, panel] });
    setSelectedId(panel.id);
  }

  async function copyScene(panel) {
    await navigator.clipboard.writeText(panel.scene || panel.caption);
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={event => event.preventDefault()} aria-label="ComicCraft home"><span className="brand-mark"><Clapperboard size={17} /></span><span>comic<span className="brand-light">craft</span></span><span className="brand-tag">STUDIO</span></a>
        <div className="top-project"><span className="top-divider" /><span className="top-title">{active?.title}</span><span className="saved-state"><i /> Saved</span></div>
        <div className="top-actions"><button className={`icon-button key-button ${serviceStatus.geminiConfigured ? 'key-ready' : ''}`} title={serviceStatus.geminiConfigured ? 'Gemini server is connected' : 'Gemini server is not configured'} onClick={() => setSettingsOpen(true)}><KeyRound size={16} />{serviceStatus.geminiConfigured && <i />}</button>
          <div className="export-wrap"><button className="button button-dark export-button" onClick={() => setExportOpen(!exportOpen)}><ArrowDownToLine size={14} /> Export <ChevronDown size={13} /></button>{exportOpen && <div className="export-menu"><button onClick={() => exportProject('txt')}><FileText size={14} /> Comic script (.txt)</button><button onClick={() => exportProject('json')}><Layers3 size={14} /> Project data (.json)</button><button onClick={() => window.print()}><BookOpen size={14} /> Export PDF</button></div>}</div>
          <button className="icon-button mobile-settings" title="Panel details" onClick={() => setMobileInspectorOpen(true)}><Settings2 size={16} /></button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <button className="new-button" onClick={newProject}><Plus size={15} /> New comic <span>⌘ N</span></button>
          <div className="side-label">WORKSPACE</div>
          <button className="nav-item active"><FolderOpen size={15} /> My comics <span className="count">{projects.length}</span></button>
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><Sparkles size={15} /> AI studio</button>
          <div className="side-label recent-label">RECENT PROJECTS<button onClick={newProject} title="New comic"><Plus size={14} /></button></div>
          <div className="project-list">{projects.map(project => <button key={project.id} className={`project-row ${active.id === project.id ? 'project-active' : ''}`} onClick={() => setActiveId(project.id)}><span className={`project-thumb thumb-${project.panels?.[0]?.art || 'empty'}`}><Clapperboard size={13} /></span><span className="project-info"><span>{project.title}</span><small>{project.panels?.length || 0} panels</small></span><MoreHorizontal className="project-more" size={15} /></button>)}</div>
          <div className="sidebar-bottom"><div className="gemini-card"><div className="gemini-title"><span>✳</span> Powered by Gemini <i className={serviceStatus.geminiConfigured ? 'connected' : ''} /></div><p>{serviceStatus.geminiConfigured ? 'Your studio is ready to create.' : 'Configure the Gemini service on the server.'}</p><button onClick={() => setSettingsOpen(true)}>{serviceStatus.geminiConfigured ? 'Service status' : 'Set up services'} <ArrowRight size={12} /></button></div><button className="help-link" onClick={() => setSettingsOpen(true)}><CircleHelp size={14} /> Help & settings</button><div className="account-row"><span className="avatar">C</span><span><b>Creative studio</b><small>Personal workspace</small></span><MoreHorizontal size={16} /></div></div>
        </aside>

        <main className="main-area">
          <div className="canvas-toolbar"><div className="breadcrumb"><span>My comics</span><ChevronDown size={12} /><b>{active?.title}</b></div><div className="canvas-tools"><span className="autosave"><Check size={12} /> All changes saved</span><span className="tool-divider" /><button className="toolbar-icon" title="Regenerate story" onClick={generateStory}><RefreshCw size={14} /></button><button className="toolbar-icon" title="More options"><MoreHorizontal size={16} /></button></div></div>
          <div className="canvas-scroll">
            <section className="comic-heading"><div className="overline"><i /> YOUR COMIC CANVAS <span>ISSUE 001</span></div><input className="comic-title" aria-label="Comic title" placeholder="Name your comic..." value={active?.title || ''} onChange={event => updateProject(active.id, { title: event.target.value })} /><div className="title-meta"><span><Clock3 size={12} /> Updated just now</span><i />{active?.panels?.length || 0} panels</div></section>

            <section className="story-form"><div className="story-head"><span className="form-icon"><WandSparkles size={16} /></span><span><b>Start with a spark</b><small>Give Gemini a story idea. We’ll turn it into a comic.</small></span><span className="model-label"><i /> GEMINI 3.5</span></div>
              <form onSubmit={generateStory}><label className="sr-only" htmlFor="story-idea">Describe your story idea</label><textarea id="story-idea" value={idea} onChange={event => { setIdea(event.target.value); updateProject(active.id, { idea: event.target.value }); }} placeholder="A tiny robot discovers the last garden on Mars..." rows={2} /><div className="story-details"><label className="story-detail">MAIN CHARACTER<input value={mainCharacter} onChange={event => { setMainCharacter(event.target.value); updateProject(active.id, { mainCharacter: event.target.value }); }} placeholder="Name and a few traits" /></label><label className="story-detail">SETTING<input list="comic-settings" value={setting} onChange={event => { setSetting(event.target.value); updateProject(active.id, { setting: event.target.value }); }} placeholder="Choose or enter a setting" /></label><datalist id="comic-settings">{SETTINGS.map(item => <option key={item} value={item} />)}</datalist><label className="story-detail">TONE<select value={tone} onChange={event => { setTone(event.target.value); updateProject(active.id, { tone: event.target.value }); }}>{TONES.map(item => <option key={item}>{item}</option>)}</select></label></div><div className="form-footer"><div className="form-controls"><label className="select-control"><span>STYLE</span><select aria-label="Illustration style" value={style} onChange={event => { setStyle(event.target.value); updateProject(active.id, { style: event.target.value }); }}>{STYLES.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={12} /></label><i /><label className="select-control panel-control"><span>PANELS</span><select aria-label="Panel count" value={panelCount} onChange={event => setPanelCount(Number(event.target.value))}>{[4, 6, 8].map(count => <option key={count}>{count}</option>)}</select><ChevronDown size={12} /></label></div><button className="button button-coral generate-button" disabled={generating}>{generating ? <><LoaderCircle className="spin" size={14} /> Writing...</> : <><Sparkles size={14} /> Generate story <ArrowRight size={14} /></>}</button></div></form>
              {error && <div className="error-message" role="alert">{error}<button title="Dismiss" onClick={() => setError('')}><X size={13} /></button></div>}
            </section>

            <div className="panels-heading"><div><span className="section-label">THE STORYBOARD</span><h2>Your panels <i>{active?.panels?.length || 0}</i></h2></div><button className="text-button" onClick={() => active?.panels?.length ? generateStory() : setNotice('Generate a story to create panels.')}><RefreshCw size={13} /> Regenerate</button></div>
            {active?.panels?.length ? <div className="panel-grid">{active.panels.map((panel, index) => <article key={panel.id} className={`comic-panel ${selectedId === panel.id ? 'selected' : ''}`} onClick={() => setSelectedId(panel.id)}>
              <div className={`panel-art ${panel.imageUrl ? 'with-image' : `art-${panel.art || 'sky'}`} }`}>{panel.imageUrl ? <img src={panel.imageUrl} alt={`Generated comic artwork: ${panel.scene}`} /> : <><span className="art-grain" /><span className="art-num">{String(index + 1).padStart(2, '0')}</span><span className="art-sun" /><span className="art-hills" /><span className="art-hills-front" /><span className="spark spark-one">✳</span><span className="spark spark-two">✦</span><span className="art-tag">{['NIGHT WATCH', 'A NEW SOUND', 'THE CLUE', 'FOUND'][index % 4]}</span><button className="art-button" title="Generate panel artwork" onClick={event => { event.stopPropagation(); generateArt(panel); }}>{artInProgress === panel.id ? <LoaderCircle className="spin" size={14} /> : <WandSparkles size={14} />}</button></>}<span className="panel-index">{String(index + 1).padStart(2, '0')}</span>{panel.imageUrl && <button className="art-button image-refresh" title="Regenerate artwork" onClick={event => { event.stopPropagation(); generateArt(panel); }}>{artInProgress === panel.id ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={13} />}</button>}<span className="speech-tail" /></div>
              <div className="panel-copy"><p>{panel.caption}</p>{panel.dialogue && <div className="dialogue"><MessageSquareText size={12} /> “{panel.dialogue}”</div>}<small>{panel.scene}</small></div>
            </article>)}<button className="add-panel" onClick={addPanel}><i><Plus size={17} /></i><b>Add a panel</b><small>Continue the story</small></button></div> : <div className="empty-canvas"><div className="empty-art"><i /><span className="empty-mountain mountain-back" /><span className="empty-mountain mountain-front" /><span className="empty-book"><BookOpen size={22} /></span><b>✳</b></div><h3>A blank page is full of possibility.</h3><p>Write one sentence above and Gemini will sketch your story into panels.</p><button className="text-button" onClick={() => document.getElementById('story-idea')?.focus()}>Write your first idea <ArrowRight size={13} /></button></div>}
            <footer className="canvas-footer"><span>Made one panel at a time.</span><span><i>✳</i> A little magic by Gemini</span></footer>
          </div>
        </main>

        <aside className={`inspector ${mobileInspectorOpen ? 'inspector-open' : ''}`}><div className="inspector-heading"><div><span className="section-label">CANVAS DETAILS</span><h2>Panel inspector</h2></div><button className="inspector-close" title="Close panel details" onClick={() => setMobileInspectorOpen(false)}><X size={16} /></button></div>
          {selected ? <><div className={`inspector-preview art-${selected.art || 'sky'}`}>{selected.imageUrl ? <img src={selected.imageUrl} alt="Selected panel artwork" /> : <><span className="preview-sun" /><span className="preview-hills" /><span className="preview-hills-front" /><span className="preview-stars">✦　✳</span></>}</div><div className="inspector-meta"><span>PANEL {String(active.panels.findIndex(panel => panel.id === selected.id) + 1).padStart(2, '0')}</span><button title="Copy scene description" onClick={() => copyScene(selected)}>{copied ? <Check size={13} /> : <Copy size={13} />}</button></div>
            <label className="inspector-label" htmlFor="caption">CAPTION</label><textarea id="caption" className="inspector-input caption-input" value={selected.caption} onChange={event => editPanel(selected.id, 'caption', event.target.value)} rows={3} />
            <label className="inspector-label" htmlFor="dialogue">DIALOGUE</label><textarea id="dialogue" className="inspector-input" value={selected.dialogue} onChange={event => editPanel(selected.id, 'dialogue', event.target.value)} placeholder="Add a line of dialogue..." rows={2} />
            <label className="inspector-label" htmlFor="scene">ART DIRECTION</label><textarea id="scene" className="inspector-input scene-input" value={selected.scene} onChange={event => editPanel(selected.id, 'scene', event.target.value)} rows={4} />
            <button className="button button-dark inspector-generate" disabled={artInProgress === selected.id} onClick={() => generateArt(selected)}>{artInProgress === selected.id ? <LoaderCircle className="spin" size={14} /> : <WandSparkles size={14} />}{selected.imageUrl ? 'Regenerate artwork' : 'Generate artwork'} <ArrowRight size={13} /></button><div className="inspector-note"><span>✳</span><p>Stable Diffusion can turn this scene into a full-color illustration. Your script stays yours to edit.</p></div></> : <div className="inspector-empty"><Layers3 size={21} /><p>Select a panel to edit its caption, dialogue, and art direction.</p></div>}
          <div className="inspector-bottom"><span>✳</span> Gemini 3.5 Flash <i className={serviceStatus.geminiConfigured ? 'connected' : ''} /><button title="AI service status" onClick={() => setSettingsOpen(true)}><Settings2 size={14} /></button></div>
        </aside>
      </div>

      {settingsOpen && <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-top"><span><KeyRound size={17} /></span><button title="Close settings" onClick={() => setSettingsOpen(false)}><X size={16} /></button></div><span className="section-label">SERVER SERVICES</span><h2 id="settings-title">AI service status</h2><div className="service-status"><p><i className={serviceStatus.geminiConfigured ? 'connected' : ''} /> Gemini story model <b>{serviceStatus.geminiConfigured ? 'Ready' : 'GEMINI_API_KEY missing'}</b></p><p><i className={serviceStatus.stableDiffusionConfigured ? 'connected' : ''} /> Stable Diffusion images <b>{serviceStatus.stableDiffusionConfigured ? 'Ready' : 'STABLE_DIFFUSION_URL missing'}</b></p></div><p className="modal-description">Set these variables in the server environment. Credentials are never sent to the browser.</p><div className="modal-actions"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a Gemini API key <ArrowRight size={12} /></a><button className="button button-coral" onClick={refreshServiceStatus}><RefreshCw size={13} /> Refresh status</button></div></section></div>}
      {notice && <div className="toast"><Check size={14} /> {notice}</div>}
    </div>
  );
}