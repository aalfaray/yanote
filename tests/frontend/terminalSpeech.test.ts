import { describe, it, expect } from 'vitest';
import { extractLastResponse, linesToParagraphs } from '../../src/lib/terminalSpeech';

const claudeScreen = [
  ' Claude Code v2.1.322',
  '',
  '> hola, ¿qué hay en esta carpeta?',
  '',
  '⏺ Respuesta vieja que no se debe leer.',
  '',
  '> revisa el roadmap y dime el estado',
  '',
  '⏺ Voy a revisar el archivo.',
  '',
  '⏺ Read(roadmaps/ROADMAP_INTEGRAL.md)',
  '  ⎿  Read 4518 lines',
  '',
  '⏺ Bash(git log --oneline -3)',
  '  ⎿  60f3da1 feat(tabs): add menu',
  '     c1bfb6d fix: responsive',
  '',
  '⏺ El roadmap tiene 75 tablas y el módulo de',
  '  inventarios está al 40%.',
  '',
  '  Pendientes:',
  '  - Conteos aprobados',
  '  - Series únicas',
  '',
  '✻ Cogitated for 12s',
  '',
  '────────────────────────────────────────',
  '❯ ',
  '────────────────────────────────────────',
  '  ⏵⏵ auto mode on',
];

describe('Terminal speech: last response', () => {
  it('reads only the text of the last Claude Code answer, skipping tools and their output', () => {
    expect(extractLastResponse(claudeScreen)).toEqual([
      'Voy a revisar el archivo.',
      'El roadmap tiene 75 tablas y el módulo de inventarios está al 40%.',
      'Pendientes:',
      '- Conteos aprobados',
      '- Series únicas',
    ]);
  });

  it('skips MCP tool calls', () => {
    const lines = ['> abre la web', '⏺ chrome-devtools - navigate_page (MCP)(url: "x")', '  ⎿  ok', '⏺ Listo, ya está abierta.'];
    expect(extractLastResponse(lines)).toEqual(['Listo, ya está abierta.']);
  });

  it('Windows Claude Code ("●" answers, "❯" prompts): reads ONLY the last answer, never earlier turns', () => {
    const windowsScreen = [
      ' ▐▛███▜▌   Claude Code v2.1.322',
      '',
      '❯ primera pregunta',
      '',
      '● Primera respuesta larga que NO se debe leer.',
      '  Sigue la primera respuesta.',
      '',
      '❯ segunda pregunta',
      '',
      '● Segunda respuesta que tampoco se lee.',
      '',
      '● Bash(git status)',
      '  ⎿  On branch master',
      '     • item de la salida de una herramienta',
      '',
      '❯ dime el estado del roadmap',
      '',
      '● Read(roadmaps/ROADMAP_INTEGRAL.md)',
      '  ⎿  Read 4518 lines',
      '',
      '● El módulo de inventarios está al 40%.',
      '',
      '  Pendientes:',
      '  • Conteos aprobados',
      '  • Series únicas',
      '',
      '✻ Brewed for 8s',
      '',
      '────────────────────────────────────────',
      '❯ ',
      '────────────────────────────────────────',
      '  ⏵⏵ auto mode on (shift+tab to cycle)',
    ];
    expect(extractLastResponse(windowsScreen)).toEqual([
      'El módulo de inventarios está al 40%.',
      'Pendientes:',
      '• Conteos aprobados',
      '• Series únicas',
    ]);
  });

  it('Codex-style CLIs ("›" prompts, "•" answers)', () => {
    const lines = ['› vieja', '• respuesta vieja', '› nueva pregunta', '• Ran npm test', '  └ ok', '• Todo listo, pasan las pruebas.'];
    expect(extractLastResponse(lines)).toContain('Todo listo, pasan las pruebas.');
    expect(extractLastResponse(lines).join(' ')).not.toContain('respuesta vieja');
  });

  it('without AI markers never reads a whole long session (only the tail)', () => {
    const lines = ['PS C:\\Users\\usuario> claude', ...Array.from({ length: 300 }, (_, i) => `linea ${i}`)];
    const read = extractLastResponse(lines).join(' ');
    expect(read).toContain('linea 299');
    expect(read).not.toContain('linea 0 ');
    expect(read).not.toContain('linea 100');
  });

  it('reads one-word answers', () => {
    expect(extractLastResponse(['> ¿listo?', '⏺ Hecho.'])).toEqual(['Hecho.']);
  });

  it('falls back to the output of the last shell command', () => {
    const lines = [
      'PS C:\\Users\\usuario> dir',
      '    Directorio: C:\\Users\\usuario',
      'Mode   Name',
      'd----  Documentos',
      'PS C:\\Users\\usuario> git status',
      'On branch master',
      'nothing to commit',
      'PS C:\\Users\\usuario> ',
    ];
    expect(extractLastResponse(lines)).toEqual(['On branch master nothing to commit']);
  });

  it('joins wrapped lines and drops table borders', () => {
    expect(linesToParagraphs(['│ Módulo │ Estado │', '', 'Una línea', 'partida.'])).toEqual([
      'Módulo Estado',
      'Una línea partida.',
    ]);
  });
});
