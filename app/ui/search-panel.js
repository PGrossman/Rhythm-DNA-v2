// Search panel logic - corrected data paths
document.addEventListener('DOMContentLoaded', async function() {
  const filters = document.getElementById('search-filters');
  const results = document.getElementById('search-results');
  
  if (!filters || !results) {
    console.error('Search panel elements not found');
    return;
  }
  
  let DB = { tracks: [], criteria: {} };
  let selectedFilters = {};
  
  // Load database
  try {
    const data = await window.api.loadSearchDb();
    if (data.ok) {
      DB.tracks = data.rhythm || [];
      DB.criteria = data.criteria || {};
    }
  } catch (e) {
    console.error('Failed to load DB:', e);
  }
  
  // Extract all unique values from tracks for each facet
  function extractAllValues() {
    const values = {
      instrument: new Set(),
      genre: new Set(),
      mood: new Set(),
      theme: new Set(),
      vocals: new Set()
    };
    
    DB.tracks.forEach(track => {
      // Instruments - check multiple possible locations
      const instruments = track.creative?.instrument || 
                         track.instrument || 
                         [];
      instruments.forEach(i => values.instrument.add(i));
      
      // Also check audio_probes for detected instruments
      if (track.audio_probes) {
        Object.entries(track.audio_probes).forEach(([key, val]) => {
          if (val === true) {
            // Map probe keys to proper instrument names
            const mapped = key.charAt(0).toUpperCase() + key.slice(1);
            values.instrument.add(mapped);
          }
        });
      }
      
      // Other creative fields
      const creative = track.creative || {};
      (creative.genre || []).forEach(g => values.genre.add(g));
      (creative.mood || []).forEach(m => values.mood.add(m));
      (creative.theme || []).forEach(t => values.theme.add(t));
      (creative.vocals || []).forEach(v => values.vocals.add(v));
    });
    
    return values;
  }
  
  // Build filters
  const actualValues = extractAllValues();
  
  filters.innerHTML = `
    <div style="margin-bottom: 20px;">
      <button id="search-clear" style="margin-right: 10px;">Clear</button>
      <button id="search-run">Search</button>
    </div>
  `;
  
  const FACETS = [
    { key: 'instrument', label: 'Instrument' },
    { key: 'genre', label: 'Genre' },
    { key: 'mood', label: 'Mood' },
    { key: 'vocals', label: 'Vocals' },
    { key: 'theme', label: 'Theme' }
  ];
  
  FACETS.forEach(({ key, label }) => {
    const values = Array.from(actualValues[key]).sort();
    if (!values.length) return;
    
    const section = document.createElement('details');
    section.style.marginBottom = '15px';
    section.open = true; // Start expanded
    
    section.innerHTML = `
      <summary style="cursor: pointer; font-weight: bold; padding: 5px 0;">
        ${label} (${values.length})
      </summary>
      <div id="facet-${key}" style="padding-left: 10px; max-height: 300px; overflow-y: auto;"></div>
    `;
    
    const body = section.querySelector(`#facet-${key}`);
    
    values.forEach(val => {
      const opt = document.createElement('label');
      opt.style.display = 'block';
      opt.style.margin = '5px 0';
      opt.innerHTML = `
        <input type="checkbox" value="${val}" data-facet="${key}">
        <span>${val}</span>
      `;
      body.appendChild(opt);
    });
    
    filters.appendChild(section);
  });
  
  // Show 5 random tracks initially
  function showRandomTracks() {
    const random = [...DB.tracks].sort(() => Math.random() - 0.5).slice(0, 5);
    renderResults(random);
  }
  
  // Get display title
  function getTitle(track) {
    // Try multiple locations for title
    return track.title || 
           track.id3?.title || 
           track.file?.replace(/\.(mp3|wav)$/i, '') ||
           track.path?.split('/').pop()?.replace(/\.(mp3|wav)$/i, '') ||
           'Unknown Track';
  }
  
  // Render results
  async function renderResults(tracks) {
    results.innerHTML = '';
    
    if (!tracks.length) {
      results.innerHTML = '<p style="padding: 20px;">No matching tracks found.</p>';
      return;
    }
    
    for (const track of tracks) {
      const card = document.createElement('div');
      card.style.cssText = 'border: 1px solid #e5e5e5; border-radius: 8px; padding: 15px; margin-bottom: 15px;';
      
      const title = getTitle(track);
      const artist = track.id3?.artist || track.artist || '';
      const path = track.path || track.file || '';
      
      // Check for waveform
      let waveformHtml = '<div style="height: 100px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; color: #999;">Waveform not available</div>';
      
      if (track.waveform_png) {
        try {
          // Check if file exists
          const response = await fetch(`file://${track.waveform_png}`);
          if (response.ok) {
            waveformHtml = `<img src="file://${track.waveform_png}" style="width: 100%; height: 100px; object-fit: cover;">`;
          }
        } catch (e) {
          // File doesn't exist, use placeholder
        }
      }
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
          <div>
            <h4 style="margin: 0 0 5px 0;">${title}</h4>
            ${artist ? `<p style="color: #666; margin: 0;">${artist}</p>` : ''}
          </div>
          <button onclick="window.api.revealInFinder('${path.replace(/'/g, "\\'")}')">Show in Finder</button>
        </div>
        ${waveformHtml}
      `;
      
      results.appendChild(card);
    }
  }
  
  // Check if track matches filters
  function trackMatches(track, filters) {
    for (const [facet, values] of Object.entries(filters)) {
      if (!values.length) continue;
      
      let trackValues = [];
      
      if (facet === 'instrument') {
        // Check multiple locations for instruments
        trackValues = track.creative?.instrument || track.instrument || [];
        
        // Also check audio probes
        if (track.audio_probes) {
          Object.entries(track.audio_probes).forEach(([key, val]) => {
            if (val === true) {
              trackValues.push(key.charAt(0).toUpperCase() + key.slice(1));
            }
          });
        }
      } else {
        // Other creative fields
        trackValues = track.creative?.[facet] || track[facet] || [];
      }
      
      // Check if track has at least one of the selected values
      const hasMatch = values.some(v => 
        trackValues.some(tv => 
          tv === v || tv.toLowerCase() === v.toLowerCase()
        )
      );
      
      if (!hasMatch) return false;
    }
    return true;
  }
  
  // Search handler
  document.getElementById('search-run')?.addEventListener('click', () => {
    selectedFilters = {};
    
    document.querySelectorAll('#search-filters input[type="checkbox"]:checked').forEach(cb => {
      const facet = cb.dataset.facet;
      if (!selectedFilters[facet]) selectedFilters[facet] = [];
      selectedFilters[facet].push(cb.value);
    });
    
    const filtered = DB.tracks.filter(track => trackMatches(track, selectedFilters));
    renderResults(filtered);
  });
  
  // Clear handler
  document.getElementById('search-clear')?.addEventListener('click', () => {
    document.querySelectorAll('#search-filters input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    showRandomTracks();
  });
  
  // Initial load
  showRandomTracks();
});
