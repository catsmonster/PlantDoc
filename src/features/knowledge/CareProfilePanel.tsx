/**
 * Care-profile panel (roadmap Phase 4A). Renders the bundled starter care pack
 * for a matched species as *sourced reference facts*, visually distinct from
 * the deterministic "Care insights" (computed from the user's logs) and the
 * Gemini AI preview. Every fact shows its provenance; a sources footer lists
 * the attributions. Themed inline to match the two existing design directions.
 */

import { useMemo } from 'react';
import {
  type CareRange,
  type SpeciesCareProfile,
  type Sourced,
} from '../../lib/knowledge/care-profiles';
import { getSource, type KnowledgeSource } from '../../lib/knowledge/sources';
import { type CommunityRange, type CultivationFact } from '../../lib/knowledge/care-profiles';
import { formatTemperature, type Units } from '../../lib/units';

interface Fact {
  label: string;
  text: string;
  sourceId: string;
}

function rangeDays(range: CareRange): string {
  return range.min === range.max ? `every ${range.min} days` : `every ${range.min}-${range.max} days`;
}

/** Renders a community indoor range; temperature respects the user's unit choice. */
function formatRange(r: CommunityRange, units: Units): string {
  if (r.attribute === 'temperature_c') {
    return `${formatTemperature(r.min, units)} - ${formatTemperature(r.max, units)}`;
  }
  const unit = r.unit ? ` ${r.unit}` : '';
  return `${r.min} - ${r.max}${unit}`;
}

/** Attribution line for a cultivation block, naming each cited source + its license. */
function cultivationSourceLine(facts: CultivationFact[]): string {
  const sources = [...new Set(facts.map((c) => c.sourceId))]
    .map(getSource)
    .filter((s): s is KnowledgeSource => s !== null);
  return sources.map((s) => `Source: ${s.name} (${s.license})`).join(' · ');
}

function buildFacts(profile: SpeciesCareProfile, units: Units): Fact[] {
  const temp = profile.comfortableTemperatureC.value;
  return [
    { label: 'Family', text: profile.family.value, sourceId: profile.family.sourceId },
    { label: 'Light', text: profile.light.value, sourceId: profile.light.sourceId },
    {
      label: 'Watering',
      text: rangeDays(profile.waterCadenceDays.value),
      sourceId: profile.waterCadenceDays.sourceId,
    },
    {
      label: 'Comfortable temp',
      text: `${formatTemperature(temp.min, units)} - ${formatTemperature(temp.max, units)}`,
      sourceId: profile.comfortableTemperatureC.sourceId,
    },
    { label: 'Humidity', text: profile.humidity.value, sourceId: profile.humidity.sourceId },
    { label: 'Toxicity', text: profile.toxicity.value, sourceId: profile.toxicity.sourceId },
    {
      label: 'Common stress signs',
      text: profile.commonStressSigns.value.join('; '),
      sourceId: profile.commonStressSigns.sourceId,
    },
    {
      label: 'Likely pests',
      text: profile.likelyPests.value.join(', '),
      sourceId: profile.likelyPests.sourceId,
    },
  ];
}

function usedSources(profile: SpeciesCareProfile): KnowledgeSource[] {
  const fields: Sourced<unknown>[] = [
    profile.family,
    profile.light,
    profile.waterCadenceDays,
    profile.comfortableTemperatureC,
    profile.humidity,
    profile.toxicity,
    profile.commonStressSigns,
    profile.likelyPests,
  ];
  const ids = new Set<string>([
    profile.nameSourceId,
    ...fields.map((f) => f.sourceId),
    ...(profile.communityRanges ?? []).map((r) => r.sourceId),
    ...(profile.cultivationFacts ?? []).map((c) => c.sourceId),
  ]);
  return [...ids].map(getSource).filter((s): s is KnowledgeSource => s !== null);
}

export function CareProfilePanel({
  profile,
  units,
  isDark,
}: {
  profile: SpeciesCareProfile;
  units: Units;
  isDark: boolean;
}) {
  const facts = useMemo(() => buildFacts(profile, units), [profile, units]);
  const sources = useMemo(() => usedSources(profile), [profile]);

  if (isDark) {
    return (
      <div style={{ marginTop: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span className="b-kicker">Species care guide</span>
          <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.09)' }}></span>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.1em', color: '#0E140F', background: '#C7F24A', padding: '3px 7px', borderRadius: 5 }}>SOURCED</span>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9BAA98' }}>
          Reference facts for <em style={{ color: '#F2F6EF', fontStyle: 'normal', fontWeight: 600 }}>{profile.scientificName}</em>, separate from your own logs.
        </p>
        {facts.map((fact) => {
          const source = getSource(fact.sourceId);
          return (
            <div key={fact.label} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: '1px solid rgba(255,255,255,.07)' }}>
              <span className="mono" style={{ width: 120, flexShrink: 0, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: '#67766A', paddingTop: 2 }}>{fact.label}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#F2F6EF' }}>{fact.text}</p>
                {source && (
                  <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#67766A' }}>Source: {source.name} ({source.license})</p>
                )}
              </div>
            </div>
          );
        })}
        {profile.communityRanges && profile.communityRanges.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: '#67766A' }}>Community indoor ranges</span>
              <span className="mono" style={{ fontSize: 9, letterSpacing: '.08em', color: '#0E140F', background: '#E7C24A', padding: '3px 6px', borderRadius: 5 }}>UNVERIFIED</span>
            </div>
            {profile.communityRanges.map((r) => (
              <div key={r.attribute} style={{ display: 'flex', gap: 12, padding: '6px 0' }}>
                <span className="mono" style={{ width: 120, flexShrink: 0, fontSize: 11, color: '#67766A' }}>{r.label}</span>
                <span style={{ fontSize: 13.5, color: '#CBD8C6' }}>{formatRange(r, units)}</span>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#67766A' }}>Source: OpenPlantbook (community-sourced, unverified)</p>
          </div>
        )}
        {profile.cultivationFacts && profile.cultivationFacts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: '#67766A' }}>Cultivation</span>
            </div>
            {profile.cultivationFacts.map((c) => (
              <div key={c.attribute} style={{ display: 'flex', gap: 12, padding: '6px 0' }}>
                <span className="mono" style={{ width: 120, flexShrink: 0, fontSize: 11, color: '#67766A' }}>{c.label}</span>
                <span style={{ flex: 1, fontSize: 13.5, color: '#CBD8C6' }}>{c.value}</span>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#67766A' }}>{cultivationSourceLine(profile.cultivationFacts)}</p>
          </div>
        )}
        <p style={{ margin: '12px 0 0', fontSize: 10.5, lineHeight: 1.6, color: '#67766A' }}>
          {sources.map((s, i) => (
            <span key={s.id}>
              {i > 0 ? ' · ' : ''}
              <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#9BAA98' }}>{s.attribution}</a>
            </span>
          ))}
        </p>
      </div>
    );
  }

  return (
    <div className="a-card a-rise" style={{ animationDelay: '40ms', marginTop: 16, borderRadius: 22, padding: '6px 18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '15px 0 4px' }}>
        <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EBF1E7', color: '#3C7140', fontSize: 18 }}>🌿</span>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#23302A' }}>Species care guide</h3>
        <span className="a-chip" style={{ background: '#EBF1E7', color: '#3C7140', padding: '3px 8px', fontSize: 10.5, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 700 }}>Sourced</span>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6B7568' }}>
        Reference facts for <em style={{ color: '#23302A', fontStyle: 'normal', fontWeight: 600 }}>{profile.scientificName}</em>, separate from your own logs.
      </p>
      {facts.map((fact, i) => {
        const source = getSource(fact.sourceId);
        return (
          <div key={fact.label} style={{ display: 'flex', gap: 12, padding: '11px 0', borderTop: i ? '1px solid #E7E0D2' : '1px solid #E7E0D2' }}>
            <span style={{ width: 116, flexShrink: 0, fontSize: 11.5, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: '#9AA294', paddingTop: 1 }}>{fact.label}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#23302A' }}>{fact.text}</p>
              {source && (
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9AA294' }}>Source: {source.name} ({source.license})</p>
              )}
            </div>
          </div>
        );
      })}
      {profile.communityRanges && profile.communityRanges.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: '#9AA294' }}>Community indoor ranges</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#7A5B12', background: '#F4E6B8', padding: '2px 7px', borderRadius: 999 }}>Unverified</span>
          </div>
          {profile.communityRanges.map((r) => (
            <div key={r.attribute} style={{ display: 'flex', gap: 12, padding: '7px 0' }}>
              <span style={{ width: 116, flexShrink: 0, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', color: '#9AA294' }}>{r.label}</span>
              <span style={{ fontSize: 14, color: '#23302A' }}>{formatRange(r, units)}</span>
            </div>
          ))}
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9AA294' }}>Source: OpenPlantbook (community-sourced, unverified)</p>
        </div>
      )}
      {profile.cultivationFacts && profile.cultivationFacts.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: '#9AA294' }}>Cultivation</span>
          </div>
          {profile.cultivationFacts.map((c) => (
            <div key={c.attribute} style={{ display: 'flex', gap: 12, padding: '7px 0' }}>
              <span style={{ width: 116, flexShrink: 0, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', color: '#9AA294' }}>{c.label}</span>
              <span style={{ flex: 1, fontSize: 14, color: '#23302A' }}>{c.value}</span>
            </div>
          ))}
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9AA294' }}>{cultivationSourceLine(profile.cultivationFacts)}</p>
        </div>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 11, lineHeight: 1.6, color: '#9AA294' }}>
        {sources.map((s, i) => (
          <span key={s.id}>
            {i > 0 ? ' · ' : ''}
            <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#6B7568' }}>{s.attribution}</a>
          </span>
        ))}
      </p>
    </div>
  );
}
