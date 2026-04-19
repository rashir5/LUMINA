import { View, Text } from 'react-native';

export default function Explore() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Intelligence AI Assistant</Text>
      <Text style={{ color: '#94a3b8', marginTop: 10 }}>Analyzing academic patterns...</Text>
    </View>
  );
}