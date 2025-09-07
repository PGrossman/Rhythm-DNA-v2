// Creative Analyzer - Ollama integration for music analysis
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Envato Epic Music categories taxonomy
const ENVATO_TAXONOMY = {
    mood: [
        'Upbeat/Energetic', 'Happy/Cheerful', 'Inspiring/Uplifting',
        'Epic/Powerful', 'Dramatic/Emotional', 'Chill/Mellow',
        'Funny/Quirky', 'Angry/Aggressive'
    ],
    genre: [
        'Cinematic', 'Corporate', 'Hip hop/Rap', 'Rock',
        'Electronic', 'Ambient', 'Funk', 'Classical'
    ],
    theme: [
        'Corporate', 'Documentary', 'Action', 'Lifestyle',
        'Sports', 'Drama', 'Nature', 'Technology'
    ],
    tempo: [
        'Very Slow (Below 60 BPM)', 'Slow (60-90 BPM)',
        'Medium (90-110 BPM)', 'Upbeat (110-140 BPM)',
        'Fast (140-160 BPM)', 'Very Fast (160+ BPM)'
    ],
    instrument: [
        'Piano', 'Acoustic Guitar', 'Violin', 'Bass',
        'Cello', 'Drums', 'Percussion', 'Electric Guitar'
    ],
    vocals: [
        'No Vocals', 'Background Vocals', 'Female Vocals',
        'Lead Vocals', 'Vocal Samples', 'Male Vocals', 'Instrumental Included'
    ],
    decade: ['2000s', '80s & 90s', '60s & 70s', '50s and earlier'],
    properties: ['Looped', 'Excludes P.R.O.']
};

export class CreativeAnalyzer {
    constructor(settings = {}) {
        this.ollamaUrl = settings.ollamaUrl || 'http://127.0.0.1:11434';
        this.model = settings.model || 'qwen3:8b';
        this.maxRetries = 2;
    }

    async checkOllamaHealth() {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`);
            if (!response.ok) {
                return { available: false, error: 'Ollama API not responding' };
            }
            const data = await response.json();
            const hasModel = data.models?.some((m) => m.name === this.model);
            return {
                available: true,
                hasModel,
                models: data.models?.map((m) => m.name) || []
            };
        } catch (error) {
            return { available: false, error: error.message };
        }
    }

    async startOllamaService() {
        try {
            await execAsync('ollama serve', { detached: true });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return true;
        } catch (error) {
            console.error('Failed to start Ollama:', error);
            return false;
        }
    }

    buildPrompt(technicalData) {
        const systemPrompt = `You are an expert music analyst specializing in categorizing audio tracks. 
Analyze the provided track information and categorize it using ONLY the values from the following taxonomy:

MOOD: ${ENVATO_TAXONOMY.mood.join(', ')}
GENRE: ${ENVATO_TAXONOMY.genre.join(', ')}
THEME: ${ENVATO_TAXONOMY.theme.join(', ')}
TEMPO: ${ENVATO_TAXONOMY.tempo.join(', ')}
INSTRUMENT: ${ENVATO_TAXONOMY.instrument.join(', ')}
VOCALS: ${ENVATO_TAXONOMY.vocals.join(', ')}
DECADE: ${ENVATO_TAXONOMY.decade.join(', ')}
PROPERTIES: ${ENVATO_TAXONOMY.properties.join(', ')}

Return your analysis as a JSON object with these exact keys:
{
  "mood": ["array of matching moods from the list"],
  "genre": ["array of matching genres from the list"],
  "theme": ["array of matching themes from the list"],
  "tempo": "single tempo range from the list",
  "instrument": ["array of detected instruments from the list"],
  "vocals": ["array of vocal characteristics from the list"],
  "decade": "single decade if applicable, or empty string",
  "properties": ["array of properties from the list"],
  "narrative": "A brief 50-80 word description of the track's musical characteristics and emotional impact",
  "confidence": 0.85
}

IMPORTANT: 
- Use ONLY the exact values from the provided lists
- Leave arrays empty [] if no matches
- Confidence should be between 0.0 and 1.0
- Return ONLY valid JSON, no other text`;

        const userPrompt = `Analyze this track:
Title: ${technicalData.title || 'Unknown'}
Artist: ${technicalData.artist || 'Unknown'}
Duration: ${technicalData.duration_sec || 0} seconds
BPM (if detected): ${technicalData.estimated_tempo_bpm || 'Unknown'}
Loudness: ${technicalData.lufs_integrated || 'Unknown'} LUFS
Sample Rate: ${technicalData.sample_rate || 44100} Hz
Channels: ${technicalData.channels === 2 ? 'Stereo' : 'Mono'}`;

        return { systemPrompt, userPrompt };
    }

    async analyzeTrack(technicalData) {
        const { systemPrompt, userPrompt } = this.buildPrompt(technicalData);
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(`${this.ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        stream: false,
                        format: 'json',
                        options: { temperature: 0.7, top_p: 0.9 }
                    })
                });

                if (!response.ok) {
                    throw new Error(`Ollama API error: ${response.status}`);
                }

                const data = await response.json();
                const content = data.message?.content;
                if (!content) {
                    throw new Error('No content in Ollama response');
                }

                const analysis = JSON.parse(content);
                const validated = this.validateAnalysis(analysis);
                return { success: true, data: validated, model: this.model, attempt };
            } catch (error) {
                console.error(`Creative analysis attempt ${attempt} failed:`, error.message);
                if (attempt === this.maxRetries) {
                    return { success: false, error: error.message, data: this.getDefaultAnalysis() };
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    validateAnalysis(analysis) {
        const validated = {
            mood: this.filterToTaxonomy(analysis.mood || [], ENVATO_TAXONOMY.mood),
            genre: this.filterToTaxonomy(analysis.genre || [], ENVATO_TAXONOMY.genre),
            theme: this.filterToTaxonomy(analysis.theme || [], ENVATO_TAXONOMY.theme),
            tempo: ENVATO_TAXONOMY.tempo.includes(analysis.tempo) ? analysis.tempo : '',
            instrument: this.filterToTaxonomy(analysis.instrument || [], ENVATO_TAXONOMY.instrument),
            vocals: this.filterToTaxonomy(analysis.vocals || [], ENVATO_TAXONOMY.vocals),
            decade: ENVATO_TAXONOMY.decade.includes(analysis.decade) ? analysis.decade : '',
            properties: this.filterToTaxonomy(analysis.properties || [], ENVATO_TAXONOMY.properties),
            narrative: String(analysis.narrative || '').slice(0, 200),
            confidence: Math.min(1, Math.max(0, Number(analysis.confidence) || 0.5))
        };
        return validated;
    }

    filterToTaxonomy(inputArray, validValues) {
        if (!Array.isArray(inputArray)) return [];
        return inputArray.filter((item) => validValues.includes(item));
    }

    getDefaultAnalysis() {
        return {
            mood: [],
            genre: [],
            theme: [],
            tempo: '',
            instrument: [],
            vocals: [],
            decade: '',
            properties: [],
            narrative: 'Creative analysis unavailable',
            confidence: 0
        };
    }

    static tempoToCategory(bpm) {
        if (!bpm || bpm < 60) return 'Very Slow (Below 60 BPM)';
        if (bpm < 90) return 'Slow (60-90 BPM)';
        if (bpm < 110) return 'Medium (90-110 BPM)';
        if (bpm < 140) return 'Upbeat (110-140 BPM)';
        if (bpm < 160) return 'Fast (140-160 BPM)';
        return 'Very Fast (160+ BPM)';
    }
}


