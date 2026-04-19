import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!, 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

export default function KanbanScreen() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // States for adding tasks
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    const { data } = await supabase.from('kanban_tasks').select('*').order('created_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  const updateStatus = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('kanban_tasks')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      // Re-fetch to see the card jump to the new section
      await fetchTasks(); 
    } catch (err) {
      console.error("Update failed:", err.message);
      alert("Move failed: " + err.message);
    }
  };

  const addTask = async () => {
    if (!newTitle.trim()) {
      alert("Please enter a task title");
      return;
    }
    
    try {
      const { error } = await supabase
        .from('kanban_tasks')
        .insert([{ 
          title: newTitle, 
          description: newDesc, 
          status: 'todo' 
        }]);

      if (error) throw error;

      // Reset and Close
      setNewTitle('');
      setNewDesc('');
      setShowAddModal(false);
      fetchTasks();
    } catch (err) {
      console.error("Error adding task:", err.message);
      alert("Database Error: " + err.message);
    }
  };

  const renderSection = (title, statusKey, dotColor) => {
    const sectionTasks = tasks.filter(t => t.status === statusKey);
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
          <Text style={styles.countText}>{sectionTasks.length}</Text>
        </View>
        
        {sectionTasks.length === 0 ? (
          <Text style={styles.emptyText}>No tasks in {title.toLowerCase()}</Text>
        ) : (
          sectionTasks.map(item => (
            <View key={item.id} style={styles.taskCard}>
              <View style={styles.cardContent}>
                <Text style={styles.taskTitle}>{item.title}</Text>
                {item.description && <Text style={styles.taskDesc}>{item.description}</Text>}
                
                {statusKey === 'todo' && (
  <TouchableOpacity 
    style={styles.moveBtn} 
    onPress={() => updateStatus(item.id, 'doing')}
  >
    <Text style={styles.moveBtnText}>Move to Doing →</Text>
  </TouchableOpacity>
)}
              </View>
              <TouchableOpacity onPress={() => updateStatus(item.id, 'done')}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerLabel}>INTELLIGENCE DASHBOARD</Text>
      <Text style={styles.header}>Kanban</Text>
      <Text style={styles.subHeader}>Track what you're doing and what's next</Text>

      {loading ? (
        <ActivityIndicator color="#6366f1" size="large" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView style={styles.scrollContainer}>
          {renderSection('Doing', 'doing', '#a855f7')}
          {renderSection('Want to Do', 'todo', '#10b981')}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.addTaskBtn} onPress={() => setShowAddModal(true)}>
        <Text style={styles.addTaskText}>+ Add Task</Text>
      </TouchableOpacity>

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Assignment</Text>
            
            <TextInput 
              style={styles.input} 
              placeholder="Task Title (e.g. OS Lab)" 
              placeholderTextColor="#64748b"
              value={newTitle}
              onChangeText={setNewTitle}
            />
            
            <TextInput 
              style={[styles.input, { height: 80, marginTop: 15 }]} 
              placeholder="Details (Optional)" 
              placeholderTextColor="#64748b"
              multiline
              value={newDesc}
              onChangeText={setNewDesc}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
                <Text style={{color: '#fff', fontWeight: '600'}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addTask}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>Create Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  headerLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 40 },
  header: { color: '#fff', fontSize: 36, fontWeight: '900', marginTop: 5 },
  subHeader: { color: '#94a3b8', fontSize: 14, marginBottom: 30 },
  scrollContainer: { flex: 1 },
  section: { marginBottom: 30 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '900', letterSpacing: 1, flex: 1 },
  countText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#475569', fontSize: 13, fontStyle: 'italic', marginLeft: 18 },
  taskCard: { 
    backgroundColor: 'rgba(30, 41, 59, 0.5)', 
    borderRadius: 16, 
    padding: 20, 
    flexDirection: 'row', 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 12
  },
  cardContent: { flex: 1 },
  taskTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  taskDesc: { color: '#64748b', fontSize: 13, marginTop: 4 },
  moveBtn: { 
    backgroundColor: 'rgba(99, 102, 241, 0.1)', 
    alignSelf: 'flex-start', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 8, 
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)'
  },
  moveBtnText: { color: '#818cf8', fontSize: 11, fontWeight: '700' },
  addTaskBtn: { 
    backgroundColor: '#6366f1', 
    padding: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginBottom: 20,
    shadowColor: '#6366f1',
    shadowOpacity: 0.3,
    shadowRadius: 10
  },
  addTaskText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#1e293b', padding: 25, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 20 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 25 },
  cancelBtn: { flex: 1, padding: 15, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  confirmBtn: { 
    flex: 1, 
    padding: 15, 
    alignItems: 'center', 
    borderRadius: 12, 
    backgroundColor: '#6366f1',
    zIndex: 999, 
    elevation: 5 
  },
});