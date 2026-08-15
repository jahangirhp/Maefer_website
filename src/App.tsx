import SensorTransformation from "./components/SensorTransformation";
import PrintDataExplorer from "./components/PrintDataExplorer";

function App() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Maefer home">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span>MAEFER</span>
        </a>
        <PrintDataExplorer />
      </header>

      <main>
        <SensorTransformation />
      </main>
    </div>
  );
}

export default App;
