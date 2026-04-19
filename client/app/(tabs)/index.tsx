import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Modal, ActivityIndicator, TextInput, Alert, ScrollView } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

const supabase = createClient('https://jjyvsayedxfzmcsssbai.supabase.co', 'sb_publishable_Buro_BCxX3HJBrDRA3x4ag_1Cy5WEWL');

export default function LuminaDashboard() {
  const quickLog = async (name, amount) => {
    const { error } = await supabase
      .from('expenses')
      .insert([{ item_name: name, amount: amount }]);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      fetchExpenses(); // Refresh the list
      Alert.alert("Success", `${name} logged!`);
    }
  };
  const [subjects, setSubjects] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [gmailCount, setGmailCount] = useState(0);
  
  const [showIntelligenceModal, setShowIntelligenceModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  
  const [newSubjectName, setNewSubjectName] = useState('');
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: '742306666500-8dhk6vodj5tei50kkankpvb7947r0g9k.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    extraParams: { prompt: 'select_account' },
    redirectUri: 'http://localhost:8081', 
  });

  useEffect(() => {
    fetchAttendance();
    fetchExpenses();
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      setUserInfo(authentication);
      fetchRealGmailData(authentication.accessToken);
    }
  }, [response]);

  // --- DATABASE FUNCTIONS ---
  const fetchAttendance = async () => {
    setRefreshing(true);
    const { data } = await supabase.from('SUBJECTS').select('*').order('name', { ascending: true });
    if (data) setSubjects(data);
    setRefreshing(false);
  };

  const fetchExpenses = async () => {
    const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
    if (data) setExpenses(data);
  };

  const deleteSubject = async (id) => {
    const { error } = await supabase.from('SUBJECTS').delete().eq('id', id);
    if (!error) fetchAttendance();
    else Alert.alert("Error", "Could not delete subject");
  };

  const handleUpdate = async (id, att, tot, pres) => {
    const newAtt = pres ? (att || 0) + 1 : (att || 0);
    const newTot = (tot || 0) + 1;
    await supabase.from('SUBJECTS').update({ attendedClasses: newAtt, totalClasses: newTot }).eq('id', id);
    fetchAttendance();
  };

  const addNewSubject = async () => {
    if (!newSubjectName.trim()) return;
    await supabase.from('SUBJECTS').insert([{ name: newSubjectName, attendedClasses: 0, totalClasses: 0 }]);
    setNewSubjectName('');
    setShowAddSubjectModal(false);
    fetchAttendance();
  };

  const addExpense = async () => {
    if (!expenseName || !expenseAmount) {
      Alert.alert("Error", "Please fill both fields");
      return;
    }
    const { error } = await supabase.from('expenses').insert([{ item_name: `💰 ${expenseName}`, amount: parseInt(expenseAmount) }]);
    if (error) Alert.alert("Database Error", error.message);
    else { setExpenseName(''); setExpenseAmount(''); setShowExpenseModal(false); fetchExpenses(); }
  };

  const fetchRealGmailData = async (token) => {
    setIsSyncing(true);
    try {
      const query = "is:unread newer_than:1d (assignment OR exam OR spit)";
      const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json();
      setGmailCount(listData.resultSizeEstimate || 0);
    } catch (e) { console.error(e); } finally { setIsSyncing(false); }
  };

  // --- CALCULATIONS ---
  const totalSpend = expenses.reduce((sum, item) => sum + item.amount, 0);
  const averageAttendance = subjects.length > 0 ? (subjects.reduce((sum, s) => sum + (s.totalClasses > 0 ? s.attendedClasses / s.totalClasses : 0), 0) / subjects.length) * 100 : 0;
  const dailyBurn = totalSpend > 0 ? (totalSpend / 7).toFixed(0) : 0; 
  const riskSubjects = subjects.filter(s => (s.totalClasses > 0 && (s.attendedClasses / s.totalClasses) < 0.75)).length;
  const stressScore = Math.min((subjects.length * 4) + (gmailCount * 10), 100);
  const stressColor = stressScore < 40 ? '#10b981' : stressScore < 75 ? '#fbbf24' : '#f43f5e';

  // --- INTELLIGENCE ALERT LOGIC ---
  const getTopPriorityAlert = () => {
    if (riskSubjects > 0) return { text: `CRITICAL: ${riskSubjects} Subjects below 75%`, color: '#f43f5e', icon: 'warning' };
    if (gmailCount > 0) return { text: `${gmailCount} New SPIT Assignment Alerts`, color: '#fbbf24', icon: 'mail' };
    if (parseInt(dailyBurn) > 500) return { text: "High spending detected this week", color: '#6366f1', icon: 'cash' };
    return { text: "All systems optimal. You're on track!", color: '#10b981', icon: 'checkmark-circle' };
  };
  const activeAlert = getTopPriorityAlert();

  const renderSubject = ({ item }) => {
    const total = item.totalClasses || 0;
    const attended = item.attendedClasses || 0;
    const percentage = total > 0 ? (attended / total) * 100 : 0;
    let statusLabel = "STABLE";
    let statusColor = "#10b981";
    let advice = "Safe to bunk today";
    if (percentage < 75) { statusLabel = "CRITICAL"; statusColor = "#f43f5e"; advice = "Must attend next lectures"; }
    else if (percentage < 80) { statusLabel = "WARNING"; statusColor = "#fbbf24"; advice = "Borderline - don't bunk"; }

    return (
      <View style={styles.glassCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.subjectName}>{item.name}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>● {statusLabel}</Text>
            </View>
          </View>
          <View style={[styles.percBadge, { borderColor: statusColor }]}>
            <Text style={[styles.percText, { color: statusColor }]}>{Math.round(percentage)}%</Text>
          </View>
        </View>
        <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${percentage}%`, backgroundColor: statusColor }]} /></View>
        <View style={styles.cardFooter}>
          <View><Text style={styles.adviceText}>{advice}</Text><Text style={styles.lecturesText}>{attended}/{total} Lectures</Text></View>
          <View style={styles.controls}>
             <TouchableOpacity onPress={() => deleteSubject(item.id)}><Ionicons name="trash-outline" size={22} color="#f43f5e" /></TouchableOpacity>
             <TouchableOpacity onPress={() => handleUpdate(item.id, attended, total, false)}><Ionicons name="close-circle-outline" size={32} color="#94a3b8" /></TouchableOpacity>
             <TouchableOpacity onPress={() => handleUpdate(item.id, attended, total, true)}><Ionicons name="checkmark-circle" size={36} color="#6366f1" /></TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
      <FlatList 
        data={subjects} 
        renderItem={renderSubject} 
        keyExtractor={(item) => item.id.toString()} 
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {fetchAttendance(); fetchExpenses();}} tintColor="#fff" />}
        ListHeaderComponent={
          <View style={styles.headerArea}>
            
            {/* 1. SMART ALERT BANNER */}
            <TouchableOpacity style={[styles.alertBanner, { backgroundColor: activeAlert.color + '15', borderColor: activeAlert.color }]}>
              <Ionicons name={activeAlert.icon} size={16} color={activeAlert.color} />
              <Text style={[styles.alertText, { color: activeAlert.color }]}>{activeAlert.text}</Text>
            </TouchableOpacity>

            <View style={styles.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>INTELLIGENCE DASHBOARD</Text>
                <Text style={styles.mainTitle}>Lumina</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, marginTop: 10 }}>
                  <View style={styles.analyticsChip}><Ionicons name="stats-chart" size={12} color="#10b981" /><Text style={styles.chipText}>{Math.round(averageAttendance)}% Attendance</Text></View>
                  <View style={styles.analyticsChip}><Ionicons name="flame" size={12} color="#fbbf24" /><Text style={styles.chipText}>₹{dailyBurn}/day</Text></View>
                  <View style={[styles.analyticsChip, riskSubjects > 0 && { borderColor: '#f43f5e' }]}><Ionicons name="warning" size={12} color={riskSubjects > 0 ? "#f43f5e" : "#94a3b8"} /><Text style={styles.chipText}>{riskSubjects} At Risk</Text></View>
                </ScrollView>
              </View>
              <TouchableOpacity style={[styles.googleBtn, userInfo && { borderColor: '#10b981' }]} onPress={() => { setUserInfo(null); promptAsync(); }}>
                {isSyncing ? <ActivityIndicator size="small" color="#10b981" /> : <Ionicons name="logo-google" size={20} color={userInfo ? "#10b981" : "#fff"} />}
              </TouchableOpacity>
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.stressBox}>
                <Text style={styles.statsLabel}>SYSTEM STRESS</Text>
                <View style={styles.meterBg}><View style={[styles.meterFill, { width: `${stressScore}%`, backgroundColor: stressColor }]} /></View>
                <Text style={[styles.stressStatus, { color: stressColor }]}>{stressScore < 40 ? 'OPTIMAL' : stressScore < 75 ? 'LOADED' : 'CRITICAL'}</Text>
              </View>
              <View style={styles.miniHeatmap}>
                  <Text style={styles.statsLabel}>ACTIVITY VELOCITY</Text>
                  <View style={styles.heatmapRow}>{[...Array(12)].map((_, i) => <View key={i} style={[styles.heatSquare, { backgroundColor: userInfo ? '#10b981' : '#6366f1', opacity: 0.4 }]} />)}</View>
              </View>
            </View>

            <View style={styles.expenseSummary}>
    <Text style={styles.statsLabel}>WEEKLY STUDENT WRAP</Text>
    <Text style={styles.totalSpend}>₹{totalSpend}</Text>
    
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        {/* Modal Button (The one you have) */}
        <TouchableOpacity onPress={() => setShowExpenseModal(true)} style={styles.miniLogBtn}>
            <Ionicons name="add-circle" size={20} color="#6366f1" />
            <Text style={styles.miniLogText}>Custom</Text>
        </TouchableOpacity>

        {/* QUICK LOG BUTTONS */}
        <TouchableOpacity onPress={() => quickLog('🍔 Vada Pav', 15)} style={styles.quickIcon}>
            <Text>🍔</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => quickLog('🛺 Auto', 20)} style={styles.quickIcon}>
            <Text>🛺</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => quickLog('☕ Chai', 10)} style={styles.quickIcon}>
            <Text>☕</Text>
        </TouchableOpacity>
    </View>
</View>

            {/* 2. SECRET DEMO TRIGGER */}
            <TouchableOpacity 
              onLongPress={() => { setUserInfo({ accessToken: 'demo' }); setGmailCount(3); Alert.alert("Demo Mode", "Gmail intelligence activated."); }}
              style={{ opacity: 0.1, height: 20, width: '100%', alignItems: 'center' }}
            >
              <Text style={{color: '#fff'}}>.</Text>
            </TouchableOpacity>

          </View>
        }
      />

      <Modal transparent visible={showExpenseModal} animationType="fade">
  <View style={styles.modalOverlay}>
    {/* Use a regular View here to avoid event bubbling issues */}
    <View style={styles.addModalBox}>
      <Text style={styles.modalTitle}>Log Expense</Text>
      
      <TextInput 
        style={styles.input} 
        placeholder="Item (e.g. Vada Pav)" 
        placeholderTextColor="#64748b" 
        value={expenseName} 
        onChangeText={setExpenseName} // Fixed this line
      />
      
      <TextInput 
        style={[styles.input, {marginTop: 10}]} 
        placeholder="Amount" 
        placeholderTextColor="#64748b" 
        keyboardType="numeric" 
        value={expenseAmount} 
        onChangeText={setExpenseAmount} 
      />

      <View style={{flexDirection: 'row', gap: 10, marginTop: 25}}>
        <TouchableOpacity 
          style={styles.cancelBtn} 
          onPress={() => setShowExpenseModal(false)}
        >
          <Text style={{color: '#fff'}}>Cancel</Text>
        </TouchableOpacity>

        {/* Added activeOpacity so you can see the click */}
        <TouchableOpacity 
          activeOpacity={0.7}
          style={[styles.confirmBtn, { backgroundColor: '#6366f1' }]} 
          onPress={() => {
             console.log("Log It Pressed!"); // Check your terminal for this!
             addExpense();
          }}
        >
          <Text style={{color: '#fff', fontWeight: 'bold'}}>Log It</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>

      <Modal transparent visible={showExpenseModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.addModalBox}>
            <Text style={styles.modalTitle}>Log Expense</Text>
            <TextInput style={styles.input} placeholder="Item" placeholderTextColor="#64748b" value={expenseName} onChangeText={setExpenseName} />
            <TextInput style={[styles.input, {marginTop: 10}]} placeholder="Amount" placeholderTextColor="#64748b" keyboardType="numeric" value={expenseAmount} onChangeText={setExpenseAmount} />
            <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowExpenseModal(false)}><Text style={{color: '#fff'}}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addExpense}><Text style={{color: '#fff', fontWeight: 'bold'}}>Log It</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  quickIcon: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: { flex: 1 },
  headerArea: { marginTop: 60, marginBottom: 20 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  greeting: { color: '#94a3b8', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  mainTitle: { color: '#fff', fontSize: 36, fontWeight: '900' },
  googleBtn: { width: 45, height: 45, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  statsContainer: { flexDirection: 'row', gap: 12 },
  stressBox: { flex: 1.5, backgroundColor: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  miniHeatmap: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  statsLabel: { color: '#64748b', fontSize: 9, fontWeight: '800', marginBottom: 10 },
  meterBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2 },
  meterFill: { height: '100%', borderRadius: 2 },
  stressStatus: { fontSize: 14, fontWeight: '900', marginTop: 10, color: '#fff' },
  heatmapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatSquare: { width: 10, height: 10, borderRadius: 2 },
  expenseSummary: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 24, marginTop: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  totalSpend: { color: '#fff', fontSize: 28, fontWeight: '900', marginVertical: 5 },
  miniLogBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  miniLogText: { color: '#6366f1', fontSize: 10, fontWeight: '800' },
  syncBadge: { backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  syncText: { color: '#10b981', fontSize: 9, fontWeight: '900' },
  addBtn: { backgroundColor: '#6366f1', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addBtnText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  addModalBox: { width: '80%', backgroundColor: '#1e293b', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 15 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  confirmBtn: { flex: 1, backgroundColor: '#6366f1', padding: 15, borderRadius: 15, alignItems: 'center' },
  cancelBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 15, alignItems: 'center' },
  glassCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 24, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  subjectName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  lecturesText: { color: '#64748b', fontSize: 12, marginTop: 4 },
  progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 3, marginTop: 15 },
  progressBarFill: { height: '100%', borderRadius: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusTag: { fontSize: 10, fontWeight: '800' },
  bunkText: { color: '#64748b', fontSize: 10, fontWeight: '600', marginTop: 2 },
  percBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  percText: { fontSize: 12, fontWeight: '800' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  analyticsChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginRight: 10, gap: 6 },
  chipText: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1, marginTop: 5 },
  statusPillText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  adviceText: { color: '#94a3b8', fontSize: 11, fontStyle: 'italic' },
  
  // NEW STYLES FOR ALERTS
  alertBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 20, gap: 10 },
  alertText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
});