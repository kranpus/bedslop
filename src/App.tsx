import { useEffect } from "react";
import { useStore } from "./store/store";
import { Sidebar } from "./ui/Sidebar";
import { ElementEditor } from "./ui/ElementEditor";
import { TagsView } from "./ui/TagsView";
import { LanguagesView } from "./ui/LanguagesView";
import { ImportReportModal } from "./ui/ImportReport";
import { ExportView, Home, RoadmapView, SettingsView, TexturesView, TopBar, VariablesView } from "./ui/Views";

export default function App() {
  const { project, view, loaded, init } = useStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".modal") || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const s = useStore.getState();
        if (e.shiftKey) s.redo(); else s.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;
  if (!project) return <><Home /><ImportReportModal /></>;

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Sidebar />
        <main className="main">
          {view === "element" && <ElementEditor />}
          {view === "textures" && <TexturesView />}
          {view === "variables" && <VariablesView />}
          {view === "tags" && <TagsView />}
          {view === "languages" && <LanguagesView />}
          {view === "settings" && <SettingsView />}
          {view === "export" && <ExportView />}
          {view === "roadmap" && <RoadmapView />}
        </main>
      </div>
      <ImportReportModal />
    </div>
  );
}
