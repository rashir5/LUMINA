import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Image, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
type ParsedSlot = {
  day: string;
  time: string;
  subject: string;
  room?: string;
};

type ParsedTimetable = {
  slots: ParsedSlot[];
  rawText: string;
};

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3000';

const MODEL_NAME = 'gemini-2.0-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

const TIMETABLE_PROMPT = `You are a timetable parser. Extract every class slot from this timetable image.
Return ONLY a valid JSON object in this exact format, with no extra text or markdown:
{
  "slots": [
    {
      "day": "Monday",
      "time": "09:00-10:00",
      "subject": "Mathematics",
      "room": "Room 101"
    }
  ],
  "rawText": "any additional text you noticed"
}
Rules:
- "day" must be a full day name (e.g. Monday, Tuesday)
- "time" must be in HH:MM-HH:MM format
- "room" is optional, omit if not visible
- If a cell is empty or a break, skip it
- Return an empty slots array if nothing is found`;

async function parseWithGemini(base64: string): Promise<ParsedTimetable> {
  if (Platform.OS === 'web') {
    const response = await fetch(`${BACKEND_URL}/api/parse-timetable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Backend error:\n${errText}`);
    }
    return response.json();
  }

  console.log('>>> Calling Gemini via fetch...');
  console.log('>>> URL:', API_URL);

  const response = await fetch(`${API_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: TIMETABLE_PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
      },
    }),
  });

  console.log('>>> HTTP Status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.log('>>> ERROR:', errText);
    throw new Error(`API Error:\n${errText}`);
  }

  const data = await response.json();
  console.log('>>> Success! Response received.');

  const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!rawText) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as ParsedTimetable;
    return {
      slots: parsed.slots ?? [],
      rawText: parsed.rawText ?? rawText,
    };
  } catch {
    console.warn('>>> Failed to parse JSON:', cleaned.substring(0, 200));
    return { slots: [], rawText: cleaned };
  }
}

export default function TimetableOCRScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timetable, setTimetable] = useState<ParsedTimetable | null>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload your timetable.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
      setTimetable(null);
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
      setTimetable(null);
    }
  };

  const parseTimetable = async () => {
    if (!imageUri || !imageBase64) return;

    if (!GEMINI_KEY && Platform.OS !== 'web') {
      Alert.alert('Missing API Key', 'Add EXPO_PUBLIC_GEMINI_KEY to your .env file and restart Expo.');
      return;
    }

    setLoading(true);
    try {
      const result = await parseWithGemini(imageBase64);
      if (result.slots.length === 0) {
        Alert.alert('No slots found', 'Try a clearer, well-lit photo of your timetable.');
      }
      setTimetable(result);
    } catch (e: any) {
      Alert.alert('Parse failed', e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const saveToSupabase = async () => {
    if (!timetable?.slots.length) return;
    setSaving(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/timetable_slots`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(timetable.slots),
      });
      if (!res.ok) throw new Error(await res.text());
      Alert.alert('Saved!', `${timetable.slots.length} slots saved to Supabase.`);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const byDay = timetable?.slots.reduce<Record<string, ParsedSlot[]>>((acc, slot) => {
    if (!acc[slot.day]) acc[slot.day] = [];
    acc[slot.day].push(slot);
    return acc;
  }, {}) ?? {};

  const days = Object.keys(byDay);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.label}>INTELLIGENCE DASHBOARD</Text>
      <Text style={s.title}>Timetable</Text>
      <Text style={s.subtitle}>Photo your timetable — Gemini parses it instantly</Text>

      {imageUri && (
        <Image source={{ uri: imageUri }} style={s.preview} resizeMode="contain" />
      )}

      <View style={s.row}>
        <TouchableOpacity style={s.btnSecondary} onPress={pickImage}>
          <Text style={s.btnSecondaryText}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={openCamera}>
          <Text style={s.btnSecondaryText}>Camera</Text>
        </TouchableOpacity>
      </View>

      {imageUri && !loading && (
        <TouchableOpacity style={s.btnPrimary} onPress={parseTimetable}>
          <Text style={s.btnPrimaryText}>Parse with Gemini Vision</Text>
        </TouchableOpacity>
      )}

      {loading && (
        <View style={s.loaderBox}>
          <ActivityIndicator color="#7c6fef" size="large" />
          <Text style={s.loaderText}>Gemini is reading your timetable...</Text>
        </View>
      )}

      {days.map(day => (
        <View key={day} style={s.dayBlock}>
          <Text style={s.dayTitle}>{day}</Text>
          {byDay[day]
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((slot, i) => (
              <View key={i} style={s.slotCard}>
                <View style={s.slotLeft}>
                  <Text style={s.slotTime}>{slot.time}</Text>
                  {slot.room && <Text style={s.slotRoom}>{slot.room}</Text>}
                </View>
                <Text style={s.slotSubject}>{slot.subject}</Text>
              </View>
            ))}
        </View>
      ))}

      {timetable && timetable.slots.length > 0 && (
        <TouchableOpacity
          style={[s.btnSave, saving && { opacity: 0.6 }]}
          onPress={saveToSupabase}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#3dd68c" />
            : <Text style={s.btnSaveText}>Save {timetable.slots.length} slots to Supabase</Text>
          }
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: '#0d1117' },
  content:          { padding: 20, paddingBottom: 60 },
  label:            { fontSize: 10, letterSpacing: 3, color: '#7a8199', marginBottom: 4 },
  title:            { fontSize: 38, fontWeight: '800', color: '#fff', marginBottom: 6 },
  subtitle:         { fontSize: 13, color: '#7a8199', marginBottom: 24, lineHeight: 20 },
  preview:          { width: '100%', height: 200, borderRadius: 14, marginBottom: 14, backgroundColor: '#161b25', borderWidth: 1, borderColor: '#252d3d' },
  row:              { flexDirection: 'row', gap: 10, marginBottom: 14 },
  btnSecondary:     { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#252d3d', backgroundColor: '#161b25', alignItems: 'center' },
  btnSecondaryText: { color: '#a89ff5', fontSize: 13, fontWeight: '700' },
  btnPrimary:       { backgroundColor: '#7c6fef', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 24 },
  btnPrimaryText:   { color: '#fff', fontSize: 15, fontWeight: '800' },
  loaderBox:        { alignItems: 'center', paddingVertical: 32, gap: 12 },
  loaderText:       { color: '#7a8199', fontSize: 13 },
  dayBlock:         { marginBottom: 20 },
  dayTitle:         { fontSize: 11, letterSpacing: 2.5, color: '#7a8199', textTransform: 'uppercase', marginBottom: 8, fontWeight: '700' },
  slotCard:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161b25', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#7c6fef', borderWidth: 1, borderColor: '#252d3d' },
  slotLeft:         { marginRight: 14, minWidth: 80 },
  slotTime:         { color: '#a89ff5', fontSize: 12, fontWeight: '700' },
  slotRoom:         { color: '#7a8199', fontSize: 11, marginTop: 2 },
  slotSubject:      { flex: 1, color: '#e8eaf0', fontSize: 14, fontWeight: '700' },
  btnSave:          { backgroundColor: '#0f4a30', borderWidth: 1, borderColor: '#3dd68c', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnSaveText:      { color: '#3dd68c', fontSize: 14, fontWeight: '800' },
});